<?php
/**
 * KMN Synthetic Order Seeder — Furniture Shop Model (Summerfield)
 *
 * Generates ~1260 realistic orders (15/day × 84 days) with distributions tuned
 * to mirror MBM observed behaviour and the premium garden-outdoor segment
 * that Summerfield sells (Ampelschirm, Lounge, Dining, Kissen…).
 *
 * See `docs/ideas/SEEDER_SPEC.md` §2 for the distribution model; AOV bands
 * and basket pairs are adapted to garden furniture (higher AOV than the
 * bedroom reference).
 *
 * REGISTERED AS WP-CLI COMMAND. DDEV-ONLY — refuses to run outside
 * `*.ddev.site`.
 *
 * Usage:
 *   ddev wp kmn seed                                          # defaults
 *   ddev wp kmn seed --weeks=12 --daily-avg=15 --seed=42      # deterministic
 *   ddev wp kmn seed --dry-run                                # plan, no writes
 *   ddev wp kmn seed reset                                    # delete flagged data
 *
 * Flags:
 *   --weeks=<int>              History window (default 12, min 4, max 26)
 *   --daily-avg=<int>          Mean orders/day (default 15)
 *   --daily-stddev=<int>       Poisson stddev (default 5)
 *   --repeat-rate=<float>      Fraction 0..1 (default 0.22)
 *   --multi-item-rate=<float>  Fraction 0..1 (default 0.25)
 *   --seed=<int>               RNG seed for determinism
 *   --dry-run                  Print plan, exit without writes
 *
 * All written orders get `_kmn_test_order = 1` meta. All seeded WP users get
 * `_kmn_test_user = 1` meta. The `reset` subcommand deletes only flagged
 * data — never touches non-seeded rows.
 */

// CLI-only. This file MUST NOT execute in web context.
if ( ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
	return;
}

final class KMN_Seeder_Command {

	// ---------------------------------------------------------------------
	// Distribution constants — see SEEDER_SPEC.md §2 for derivation.
	// ---------------------------------------------------------------------

	// §2b — Hour-of-day weights (weekday curve).
	const HOUR_WEIGHTS = [
		0  => 0,  1  => 0,  2  => 0,  3  => 0,  4  => 0,  5  => 0,
		6  => 0,  7  => 1,  8  => 2,  9  => 4,
		10 => 7,  11 => 8,  12 => 6,  13 => 5,  14 => 6,  15 => 7,
		16 => 6,  17 => 4,  18 => 5,  19 => 9,  20 => 12, 21 => 8,
		22 => 4,  23 => 1,
	];

	// §2c — Day-of-week shares.
	const DOW_SHARES = [
		'Mon' => 0.12, 'Tue' => 0.14, 'Wed' => 0.14, 'Thu' => 0.20,
		'Fri' => 0.18, 'Sat' => 0.14, 'Sun' => 0.08,
	];

	// §2d — Basket size shares.
	const BASKET_SIZE_SHARES = [
		1 => 0.75, 2 => 0.18, 3 => 0.05, 4 => 0.015, 5 => 0.005,
	];

	// §2e — AOV bands ADAPTED to Summerfield premium garden segment.
	// Original SEEDER_SPEC targets bedroom-furniture AOV ~950€. Summerfield
	// garden-outdoor bias pushes AOV to ~2500-3000€. These bands honour
	// actual product catalog (min 62€, max 18899€, avg 1391€).
	const AOV_BANDS = [
		[ 'min' => 0,    'max' => 500,   'order_share' => 0.20 ],
		[ 'min' => 500,  'max' => 1500,  'order_share' => 0.30 ],
		[ 'min' => 1500, 'max' => 3000,  'order_share' => 0.25 ],
		[ 'min' => 3000, 'max' => 6000,  'order_share' => 0.17 ],
		[ 'min' => 6000, 'max' => null,  'order_share' => 0.08 ],
	];

	// §2f — Payment methods.
	const PAYMENT_METHODS = [
		[ 'key' => 'klarna', 'title' => 'Klarna',      'share' => 0.40 ],
		[ 'key' => 'paypal', 'title' => 'PayPal',      'share' => 0.30 ],
		[ 'key' => 'stripe', 'title' => 'Kreditkarte', 'share' => 0.23 ],
		[ 'key' => 'bacs',   'title' => 'Überweisung', 'share' => 0.07 ],
	];

	// §2g — Order statuses (87% paid).
	const STATUS_SHARES = [
		'wc-completed'  => 0.72,
		'wc-processing' => 0.15,
		'wc-on-hold'    => 0.05,
		'wc-pending'    => 0.03,
		'wc-failed'     => 0.03,
		'wc-cancelled'  => 0.02,
	];

	// §2h — Customer cohort composition.
	const COHORT = [
		'one_time'     => 0.78,
		'repeat_2x'    => 0.18,
		'repeat_3x'    => 0.03,
		'repeat_4plus' => 0.01,
	];

	// §2i — Pre-seeded basket pairs ADAPTED to Summerfield garden domain.
	// Original SEEDER_SPEC used bedroom combos (Boxspringbett+Lattenrost).
	// Here: natural garden co-purchases to guarantee market-basket signal.
	const BASKET_PAIRS = [
		[ 'Ampelschirm',  'Sockel' ],        // parasol + base — highest lift
		[ 'Ampelschirm',  'Schutzhülle' ],   // parasol + cover
		[ 'Gartenmöbel',  'Kissen' ],        // garden furniture + cushions
		[ 'Lounge',       'Kissen' ],        // lounge + cushions
		[ 'Daybed',       'Kissen' ],        // daybed + cushions
		[ 'Dining',       'Lounge' ],        // full terrace
	];

	const META_TEST_ORDER = '_kmn_test_order';
	const META_TEST_USER  = '_kmn_test_user';

	const SEED_GUEST_EMAIL_DOMAIN = 'kmn-test.local';

	/**
	 * Internal: enriched product pool cache.
	 * Shape: array<int, ['id'=>int, 'title'=>string, 'price'=>float]>
	 */
	private $products = [];

	/**
	 * Internal: active customer pool (populated per seed run).
	 * Shape: array<int, [
	 *     'email'=>string, 'first_name'=>string, 'last_name'=>string,
	 *     'user_id'=>int|0, 'order_dates'=>array<string> (YYYY-MM-DD)
	 * ]>
	 */
	private $customer_slots = [];

	/**
	 * Maps YYYY-MM-DD => array of customer indexes assigned to that day.
	 */
	private $slots_by_date = [];

	// ---------------------------------------------------------------------
	// WP-CLI entrypoint
	// ---------------------------------------------------------------------

	/**
	 * Seeds synthetic orders for Summerfield DDEV.
	 *
	 * ## OPTIONS
	 *
	 * [<subcommand>]
	 * : Optional. Use "reset" to delete previously seeded orders + users.
	 *
	 * [--weeks=<int>]
	 * : History window in weeks. Default 12. Range 4-26.
	 *
	 * [--daily-avg=<int>]
	 * : Mean orders per day. Default 15.
	 *
	 * [--daily-stddev=<int>]
	 * : Poisson-ish stddev. Default 5.
	 *
	 * [--repeat-rate=<float>]
	 * : Fraction of customers who order ≥2 times in window. Default 0.22.
	 *
	 * [--multi-item-rate=<float>]
	 * : Fraction of orders with ≥2 items. Default 0.25.
	 *
	 * [--seed=<int>]
	 * : RNG seed for deterministic runs.
	 *
	 * [--dry-run]
	 * : Print plan summary and exit without writing.
	 */
	public function seed( $args, $assoc_args ) {

		$this->guard_environment(); // SEED-07 — hard fail outside *.ddev.site

		// Sub-dispatch: `wp kmn seed reset`
		if ( isset( $args[0] ) && $args[0] === 'reset' ) {
			$this->reset( $assoc_args );
			return;
		}

		$started_at = microtime( true );

		// ---- Parse flags ------------------------------------------------
		$weeks        = max( 4, min( 26, (int) ( $assoc_args['weeks']       ?? 12 ) ) );
		$daily_avg    = max( 1, (int) ( $assoc_args['daily-avg']            ?? 15 ) );
		$daily_stddev = max( 0, (int) ( $assoc_args['daily-stddev']         ?? 5  ) );
		$repeat_rate  = max( 0.0, min( 1.0, (float) ( $assoc_args['repeat-rate']     ?? 0.22 ) ) );
		$multi_item   = max( 0.0, min( 1.0, (float) ( $assoc_args['multi-item-rate'] ?? 0.25 ) ) );
		$dry_run      = isset( $assoc_args['dry-run'] );
		$rng_seed     = isset( $assoc_args['seed'] ) ? (int) $assoc_args['seed'] : null;

		if ( $rng_seed !== null ) {
			mt_srand( $rng_seed );
		}

		// ---- Performance hygiene ---------------------------------------
		update_option( 'woocommerce_email_new_order_enabled', 'no' );
		if ( ! defined( 'WP_IMPORTING' ) ) {
			define( 'WP_IMPORTING', true );
		}
		// Suppress WC transactional email actions during seed.
		remove_all_actions( 'woocommerce_order_status_pending_to_processing_notification' );
		remove_all_actions( 'woocommerce_order_status_pending_to_completed_notification' );
		remove_all_actions( 'woocommerce_order_status_completed_notification' );
		remove_all_actions( 'woocommerce_order_status_processing_notification' );
		remove_all_actions( 'woocommerce_new_order_notification' );
		// Suppress Klaviyo / Mailjet / analytics listeners that hook into WC order events.
		remove_all_actions( 'woocommerce_new_order' );
		remove_all_actions( 'woocommerce_checkout_order_processed' );

		// ---- Plan daily counts -----------------------------------------
		$daily_plan   = $this->plan_daily_counts( $weeks, $daily_avg, $daily_stddev );
		$total_orders = array_sum( $daily_plan );

		WP_CLI::log( sprintf(
			'Plan: %d weeks, avg %d/day, target ~%d orders (repeat=%0.2f, multi-item=%0.2f)%s',
			$weeks, $daily_avg, $total_orders, $repeat_rate, $multi_item,
			$dry_run ? ' [DRY RUN]' : ''
		) );

		// ---- Load product pool -----------------------------------------
		$this->products = $this->load_product_pool();
		if ( count( $this->products ) < 10 ) {
			WP_CLI::error( sprintf(
				'Product catalog too small (%d published products). Import Summerfield products first.',
				count( $this->products )
			) );
		}
		WP_CLI::log( sprintf( 'Product pool: %d products (avg price €%0.0f).',
			count( $this->products ),
			array_sum( array_column( $this->products, 'price' ) ) / max( 1, count( $this->products ) )
		) );

		// ---- Build customer slot list ---------------------------------
		$this->build_customer_slots( $daily_plan, $repeat_rate );
		WP_CLI::log( sprintf( 'Customer pool: %d unique (%d one-time, %d repeat).',
			count( $this->customer_slots ),
			count( array_filter( $this->customer_slots, fn( $c ) => count( $c['order_dates'] ) === 1 ) ),
			count( array_filter( $this->customer_slots, fn( $c ) => count( $c['order_dates'] ) >= 2 ) )
		) );

		if ( $dry_run ) {
			$this->print_plan_summary( $daily_plan, $repeat_rate, $multi_item );
			return;
		}

		// ---- Emit orders day-by-day -----------------------------------
		$progress = \WP_CLI\Utils\make_progress_bar( 'Seeding orders', $total_orders );
		$created  = 0;
		$skipped  = 0;

		foreach ( $daily_plan as $date_str => $count_for_day ) {
			$dow_label    = date( 'D', strtotime( $date_str ) );
			$hour_weights = $this->hour_weights_for_dow( $dow_label );

			// Customer assignments for this day (if any).
			$day_customers = $this->slots_by_date[ $date_str ] ?? [];

			for ( $i = 0; $i < $count_for_day; $i++ ) {
				$hour   = (int) $this->weighted_pick( $hour_weights );
				$minute = mt_rand( 0, 59 );
				$second = mt_rand( 0, 59 );
				$dt_utc = sprintf( '%s %02d:%02d:%02d', $date_str, $hour, $minute, $second );

				$customer = $this->take_customer_for_day( $day_customers, $date_str );

				$items = $this->compose_basket( $multi_item );
				if ( empty( $items ) ) {
					$skipped++;
					$progress->tick();
					continue;
				}

				$status  = (string) $this->weighted_pick( self::STATUS_SHARES );
				$payment = $this->pick_payment_method();

				try {
					$this->create_order( $dt_utc, $customer, $items, $status, $payment );
					$created++;
				} catch ( \Throwable $e ) {
					$skipped++;
					WP_CLI::warning( 'Order create failed: ' . $e->getMessage() );
				}
				$progress->tick();
			}
		}
		$progress->finish();

		// Force HPOS stats sync via WC OrdersScheduler + action-scheduler.
		$this->resync_order_stats();

		$elapsed = microtime( true ) - $started_at;
		WP_CLI::success( sprintf(
			'Seeded %d orders (%d skipped) across %d days in %0.1fs.',
			$created, $skipped, count( $daily_plan ), $elapsed
		) );
	}

	/**
	 * Populate WC Analytics order_stats table.
	 *
	 * We could queue the full WC OrdersScheduler batch system, but with
	 * thousands of orders it enqueues 20k+ actions and takes many minutes
	 * to drain. Since wc_create_order() already populates most lookup
	 * tables via its own hooks, in practice the stats rows are already
	 * present after the seed loop. Here we just nudge action-scheduler to
	 * run whatever is in the queue within a bounded budget.
	 */
	private function resync_order_stats() {

		// Verify stats table is populated. If not, fall back to queue+drain.
		global $wpdb;
		$stats_count = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->prefix}wc_order_stats"
		);
		$orders_count = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->prefix}wc_orders"
		);

		if ( $stats_count >= $orders_count ) {
			WP_CLI::log( sprintf(
				'Stats table in sync (%d stats vs %d orders).',
				$stats_count, $orders_count
			) );
			return;
		}

		WP_CLI::log( sprintf(
			'Stats table lagging (%d stats vs %d orders). Triggering sync…',
			$stats_count, $orders_count
		) );

		$scheduler_class = '\\Automattic\\WooCommerce\\Internal\\Admin\\Schedulers\\OrdersScheduler';
		if ( class_exists( $scheduler_class ) && method_exists( $scheduler_class, 'queue_batches' ) ) {
			try {
				// Large batch_size keeps the queue SHORT.
				call_user_func( [ $scheduler_class, 'queue_batches' ], 1, PHP_INT_MAX, 1000 );
			} catch ( \Throwable $e ) {
				WP_CLI::warning( 'OrdersScheduler::queue_batches failed: ' . $e->getMessage() );
			}
		}

		// Drain a bounded number of batches — avoids hanging on giant queues.
		WP_CLI::runcommand(
			'action-scheduler run --batch-size=500 --batches=5',
			[ 'launch' => false, 'exit_error' => false ]
		);
	}

	// ---------------------------------------------------------------------
	// Reset
	// ---------------------------------------------------------------------

	/**
	 * Deletes every order flagged `_kmn_test_order = 1` and every user
	 * flagged `_kmn_test_user = 1`. Idempotent.
	 */
	private function reset( $assoc_args ) {

		$this->guard_environment();
		$started_at = microtime( true );

		// Find orders (HPOS-safe via wc_get_orders).
		$order_ids = wc_get_orders( [
			'meta_key'   => self::META_TEST_ORDER,
			'meta_value' => 1,
			'limit'      => -1,
			'return'     => 'ids',
		] );

		$order_count = is_array( $order_ids ) ? count( $order_ids ) : 0;

		if ( $order_count > 0 ) {
			$progress = \WP_CLI\Utils\make_progress_bar( 'Deleting seeded orders', $order_count );
			foreach ( $order_ids as $id ) {
				$order = wc_get_order( $id );
				if ( $order ) {
					$order->delete( true ); // force = bypass trash, HPOS-safe
				} else {
					wp_delete_post( $id, true );
				}
				$progress->tick();
			}
			$progress->finish();
		}

		// Find & delete seeded users.
		$users = get_users( [
			'meta_key'   => self::META_TEST_USER,
			'meta_value' => 1,
		] );
		$user_count = count( $users );

		if ( $user_count > 0 ) {
			foreach ( $users as $u ) {
				wp_delete_user( $u->ID );
			}
		}

		// Clean up wp_wc_customer_lookup rows for seeded guest emails
		// (SEEDER_SPEC §7 open question 4). HPOS installs carry these.
		global $wpdb;
		$lookup_table = $wpdb->prefix . 'wc_customer_lookup';
		$like         = '%@' . self::SEED_GUEST_EMAIL_DOMAIN;
		$wpdb->query( $wpdb->prepare(
			"DELETE FROM {$lookup_table} WHERE email LIKE %s",
			$like
		) );

		// Stats table sync so queries reflect the delete immediately.
		$this->resync_order_stats();

		$elapsed = microtime( true ) - $started_at;
		WP_CLI::success( sprintf(
			'Reset complete: %d orders + %d users deleted in %0.1fs.',
			$order_count, $user_count, $elapsed
		) );
	}

	// ---------------------------------------------------------------------
	// Environment guard — SEED-07
	// ---------------------------------------------------------------------

	private function guard_environment() {
		$siteurl = (string) get_option( 'siteurl' );
		if ( ! preg_match( '/\.ddev\.site/i', $siteurl ) ) {
			WP_CLI::error( sprintf(
				"Refusing to run: siteurl is '%s'. Seeder only runs on *.ddev.site to prevent accidental prod execution.",
				$siteurl
			) );
		}
	}

	// ---------------------------------------------------------------------
	// Daily count planning
	// ---------------------------------------------------------------------

	/**
	 * Returns [date_str => count] over the $weeks window ending yesterday
	 * (so all orders are in the past). Applies DOW bias + Poisson-like noise.
	 */
	private function plan_daily_counts( $weeks, $avg, $stddev ) {

		$days = $weeks * 7;
		$end  = new DateTimeImmutable( 'yesterday', new DateTimeZone( 'UTC' ) );

		// Baseline: avg per day, roughly Gaussian around avg with stddev.
		// Use Box-Muller for normal variate then floor to integer, clamped.
		$plan = [];

		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$date  = $end->sub( new DateInterval( 'P' . $i . 'D' ) );
			$d_key = $date->format( 'Y-m-d' );
			$dow   = $date->format( 'D' );

			// Start with Gaussian sample.
			$n = $this->gaussian( $avg, $stddev );

			// Apply DOW bias: reshape around 1.0 multiplier where 1/7 is neutral.
			$share  = self::DOW_SHARES[ $dow ] ?? ( 1.0 / 7.0 );
			$factor = $share * 7.0; // 1.0 = neutral; 1.4 = Thu; 0.56 = Sun
			$n      = $n * $factor;

			// Holiday spikes: 2% chance of +40% bump.
			if ( mt_rand( 0, 99 ) < 2 ) {
				$n *= 1.4;
			}

			$n = max( 0, (int) round( $n ) );
			$plan[ $d_key ] = $n;
		}

		return $plan;
	}

	/**
	 * Box-Muller normal variate, clamped to ≥0.
	 */
	private function gaussian( $mean, $sigma ) {
		if ( $sigma <= 0 ) {
			return $mean;
		}
		$u1 = ( mt_rand( 1, PHP_INT_MAX ) / PHP_INT_MAX );
		$u2 = ( mt_rand( 1, PHP_INT_MAX ) / PHP_INT_MAX );
		$z  = sqrt( -2.0 * log( $u1 ) ) * cos( 2.0 * M_PI * $u2 );
		return $mean + $z * $sigma;
	}

	/**
	 * Weekend morning dip: cut hours 7-11 by 30% on Sat/Sun. Returns hour
	 * => weight map identical to HOUR_WEIGHTS with the dip applied.
	 */
	private function hour_weights_for_dow( $dow_label ) {
		$w = self::HOUR_WEIGHTS;
		if ( $dow_label === 'Sat' || $dow_label === 'Sun' ) {
			for ( $h = 7; $h <= 11; $h++ ) {
				$w[ $h ] = (int) floor( $w[ $h ] * 0.7 );
			}
		}
		return $w;
	}

	// ---------------------------------------------------------------------
	// Product pool + AOV band selection
	// ---------------------------------------------------------------------

	/**
	 * Loads published products with positive prices. Uses direct SQL for
	 * speed over wc_get_products() on large catalogues.
	 */
	private function load_product_pool() {
		global $wpdb;

		$rows = $wpdb->get_results(
			"SELECT p.ID, p.post_title, CAST(pm.meta_value AS DECIMAL(10,2)) AS price
			   FROM {$wpdb->posts} p
			   JOIN {$wpdb->postmeta} pm ON pm.post_id = p.ID AND pm.meta_key = '_price'
			  WHERE p.post_type   = 'product'
			    AND p.post_status = 'publish'
			    AND pm.meta_value REGEXP '^[0-9]+\\.?[0-9]*$'
			    AND CAST(pm.meta_value AS DECIMAL(10,2)) > 0",
			ARRAY_A
		);

		$pool = [];
		foreach ( $rows as $r ) {
			$pool[] = [
				'id'    => (int) $r['ID'],
				'title' => (string) $r['post_title'],
				'price' => (float) $r['price'],
			];
		}
		return $pool;
	}

	/**
	 * Pick a product whose price lands in a randomly-selected AOV band.
	 */
	private function pick_product_for_aov() {

		// Pick a band weighted by order_share.
		$weights = [];
		foreach ( self::AOV_BANDS as $idx => $band ) {
			$weights[ $idx ] = $band['order_share'];
		}
		$band_idx = (int) $this->weighted_pick( $weights );
		$band     = self::AOV_BANDS[ $band_idx ];

		$min = (float) $band['min'];
		$max = $band['max'] === null ? PHP_FLOAT_MAX : (float) $band['max'];

		// Filter pool.
		$candidates = array_values( array_filter(
			$this->products,
			fn( $p ) => $p['price'] >= $min && $p['price'] < $max
		) );

		if ( empty( $candidates ) ) {
			// Fallback to full pool if band has no matching products.
			$candidates = $this->products;
		}

		return $candidates[ array_rand( $candidates ) ];
	}

	/**
	 * Case-insensitive substring search by product title.
	 * Returns product array or null.
	 */
	private function find_product_by_name_substring( $needle ) {
		$needle_low = mb_strtolower( $needle );
		$matches    = [];
		foreach ( $this->products as $p ) {
			if ( strpos( mb_strtolower( $p['title'] ), $needle_low ) !== false ) {
				$matches[] = $p;
			}
		}
		if ( empty( $matches ) ) {
			return null;
		}
		return $matches[ array_rand( $matches ) ];
	}

	// ---------------------------------------------------------------------
	// Basket composition — SEED-04
	// ---------------------------------------------------------------------

	/**
	 * Compose a basket respecting BASKET_SIZE_SHARES + multi-item rate +
	 * pre-seeded basket pairs (60% probability on multi-item baskets).
	 *
	 * Returns array<[product_id => int, qty => int]>.
	 */
	private function compose_basket( $multi_item_rate ) {

		// Adjust BASKET_SIZE_SHARES towards multi-item via rate.
		// Default `1 => 0.75` flips to `1 => 1 - multi_item_rate`.
		$adjusted = self::BASKET_SIZE_SHARES;
		$adjusted[1] = max( 0.0, 1.0 - $multi_item_rate );
		// Redistribute remainder proportionally across sizes 2-5.
		$tail_total = self::BASKET_SIZE_SHARES[2] + self::BASKET_SIZE_SHARES[3]
		            + self::BASKET_SIZE_SHARES[4] + self::BASKET_SIZE_SHARES[5];
		$scale = $tail_total > 0 ? ( $multi_item_rate / $tail_total ) : 1.0;
		for ( $s = 2; $s <= 5; $s++ ) {
			$adjusted[ $s ] = self::BASKET_SIZE_SHARES[ $s ] * $scale;
		}

		$size = (int) $this->weighted_pick( $adjusted );

		// Size 1 → single product picked via AOV band.
		if ( $size === 1 ) {
			$p = $this->pick_product_for_aov();
			return [ [ 'product_id' => $p['id'], 'qty' => 1 ] ];
		}

		// Multi-item: 60% of the time force a known pair for basket signal.
		if ( $size >= 2 && mt_rand( 0, 99 ) < 60 ) {
			$pair = self::BASKET_PAIRS[ array_rand( self::BASKET_PAIRS ) ];
			$a    = $this->find_product_by_name_substring( $pair[0] );
			$b    = $this->find_product_by_name_substring( $pair[1] );
			if ( $a && $b ) {
				$items = [
					[ 'product_id' => $a['id'], 'qty' => 1 ],
					[ 'product_id' => $b['id'], 'qty' => 1 ],
				];
				// Fill remaining slots with random products.
				for ( $k = 2; $k < $size; $k++ ) {
					$p = $this->pick_product_for_aov();
					$items[] = [ 'product_id' => $p['id'], 'qty' => 1 ];
				}
				return $items;
			}
		}

		// Fallback: random multi-item basket.
		$items = [];
		$seen  = [];
		$guard = 0;
		while ( count( $items ) < $size && $guard++ < 20 ) {
			$p = $this->pick_product_for_aov();
			if ( isset( $seen[ $p['id'] ] ) ) {
				continue;
			}
			$seen[ $p['id'] ] = true;
			$items[] = [ 'product_id' => $p['id'], 'qty' => 1 ];
		}
		return $items;
	}

	// ---------------------------------------------------------------------
	// Customer pool — SEED-03
	// ---------------------------------------------------------------------

	/**
	 * Build customer slots to hit the target repeat rate:
	 * - Roughly 78% one-time, 18% repeat 2x, 3% repeat 3x, 1% repeat 4-5x.
	 * - Repeat orders are spaced with median ~55-day gap.
	 * - Customers are randomly placed on days that have capacity in $daily_plan.
	 */
	private function build_customer_slots( $daily_plan, $repeat_rate ) {

		$total_orders = array_sum( $daily_plan );

		// Per-day remaining capacity. Decrements as we assign customers.
		$capacity = $daily_plan;
		$dates_in_order = array_keys( $daily_plan ); // chronological

		// Cohort sizing — derived from total_orders + repeat_rate so the
		// expected total exactly fits $total_orders capacity.
		// Of the unique customers, $repeat_rate fraction order ≥2 times.
		// Among those, sub-shares are normalised from COHORT.
		$rep_total = self::COHORT['repeat_2x'] + self::COHORT['repeat_3x'] + self::COHORT['repeat_4plus'];
		$avg_per_one_time = 1.0;
		$avg_per_repeat   = (
			self::COHORT['repeat_2x']    * 2.0
			+ self::COHORT['repeat_3x']    * 3.0
			+ self::COHORT['repeat_4plus'] * 4.5
		) / $rep_total;
		$avg_per_customer = ( 1.0 - $repeat_rate ) * $avg_per_one_time
		                  + $repeat_rate * $avg_per_repeat;

		$n_customers = max( 1, (int) round( $total_orders / max( 0.1, $avg_per_customer ) ) );
		$n_repeat    = (int) round( $n_customers * $repeat_rate );
		$n_one_time  = $n_customers - $n_repeat;

		$n_rep2 = (int) round( $n_repeat * ( self::COHORT['repeat_2x']    / $rep_total ) );
		$n_rep3 = (int) round( $n_repeat * ( self::COHORT['repeat_3x']    / $rep_total ) );
		$n_rep4 = max( 0, $n_repeat - $n_rep2 - $n_rep3 );

		$customers = [];

		// Repeat customers FIRST so they secure their multi-date slots
		// before one-time customers consume the day capacities.
		// Repeat-4plus (VIPs) — 4-5 orders, ~20d gaps.
		for ( $i = 0; $i < $n_rep4; $i++ ) {
			$n_orders = mt_rand( 4, 5 );
			$dates    = $this->plan_repeat_dates( $capacity, $dates_in_order, $n_orders, 20 );
			if ( count( $dates ) < 2 ) { continue; }
			$customers[] = $this->make_customer_record( count( $customers ), $dates );
		}
		// Repeat-3x — 3 orders, ~40d gaps.
		for ( $i = 0; $i < $n_rep3; $i++ ) {
			$dates = $this->plan_repeat_dates( $capacity, $dates_in_order, 3, 40 );
			if ( count( $dates ) < 2 ) { continue; }
			$customers[] = $this->make_customer_record( count( $customers ), $dates );
		}
		// Repeat-2x — 2 orders, ~55d gaps.
		for ( $i = 0; $i < $n_rep2; $i++ ) {
			$dates = $this->plan_repeat_dates( $capacity, $dates_in_order, 2, 55 );
			if ( count( $dates ) < 2 ) { continue; }
			$customers[] = $this->make_customer_record( count( $customers ), $dates );
		}

		// One-time customers fill remaining capacity (any day with cap > 0).
		while ( true ) {
			$picked = $this->take_any_capacity_date( $capacity, $dates_in_order );
			if ( $picked === null ) { break; }
			$customers[] = $this->make_customer_record( count( $customers ), [ $picked ] );
		}

		$this->customer_slots = $customers;

		// Build index: date_str => [customer_idx, customer_idx, ...]
		$this->slots_by_date = [];
		foreach ( $customers as $idx => $c ) {
			foreach ( $c['order_dates'] as $d ) {
				$this->slots_by_date[ $d ][] = $idx;
			}
		}
	}

	/**
	 * Plan a sequence of $n_orders dates spaced by ~$median_gap days, each
	 * with available capacity. First date is picked from any capacity;
	 * subsequent dates target $median_gap from the previous one and slide
	 * to nearest available date if necessary. Decrements capacity in place.
	 */
	private function plan_repeat_dates( &$capacity, $dates_in_order, $n_orders, $median_gap ) {

		$picked = [];

		// First date — random from days that have capacity.
		$first = $this->take_any_capacity_date( $capacity, $dates_in_order );
		if ( $first === null ) { return $picked; }
		$picked[] = $first;
		$last     = $first;

		// Subsequent dates — target $last + median_gap (±30%) and snap.
		for ( $k = 1; $k < $n_orders; $k++ ) {
			$jitter = (int) round( $median_gap * ( 0.7 + ( mt_rand( 0, 60 ) / 100.0 ) ) );
			$target = ( new DateTimeImmutable( $last ) )
			            ->add( new DateInterval( 'P' . max( 1, $jitter ) . 'D' ) )
			            ->format( 'Y-m-d' );

			$found = $this->take_nearest_capacity_date( $capacity, $target );
			if ( $found === null ) { break; }
			$picked[] = $found;
			$last     = $found;
		}
		return $picked;
	}

	/**
	 * Pop one date with capacity, picking RANDOMLY across days that have cap > 0.
	 * Returns null if no capacity remains.
	 */
	private function take_any_capacity_date( &$capacity, $dates_in_order ) {
		$avail = [];
		foreach ( $dates_in_order as $d ) {
			if ( ( $capacity[ $d ] ?? 0 ) > 0 ) {
				$avail[] = $d;
			}
		}
		if ( empty( $avail ) ) { return null; }
		$d = $avail[ array_rand( $avail ) ];
		$capacity[ $d ]--;
		return $d;
	}

	/**
	 * Find the date with capacity nearest (in absolute days) to $target.
	 * Decrements capacity. Returns null if none remain anywhere.
	 */
	private function take_nearest_capacity_date( &$capacity, $target ) {
		$target_ts = strtotime( $target );
		$best      = null;
		$best_dist = PHP_INT_MAX;
		foreach ( $capacity as $d => $cap ) {
			if ( $cap <= 0 ) { continue; }
			$dist = abs( strtotime( $d ) - $target_ts );
			if ( $dist < $best_dist ) {
				$best_dist = $dist;
				$best      = $d;
			}
		}
		if ( $best === null ) { return null; }
		$capacity[ $best ]--;
		return $best;
	}

	private function make_customer_record( $idx, $order_dates ) {
		$first_names = [
			'Anna', 'Lukas', 'Sophie', 'Felix', 'Emma', 'Paul', 'Marie',
			'Jonas', 'Lena', 'Maximilian', 'Hannah', 'Ben', 'Mia', 'Elias',
			'Laura', 'Tim', 'Julia', 'David', 'Sarah', 'Simon', 'Lisa',
			'Thomas', 'Katharina', 'Michael', 'Nina',
		];
		$last_names = [
			'Huber', 'Gruber', 'Mayr', 'Wagner', 'Bauer', 'Pichler', 'Moser',
			'Steiner', 'Hofer', 'Wallner', 'Leitner', 'Berger', 'Fuchs',
			'Koller', 'Auer', 'Eder', 'Schmid', 'Reiter', 'Schneider',
		];
		$is_registered = mt_rand( 0, 99 ) < 20; // 20% registered, 80% guest
		$prefix        = $is_registered ? 'seed-user' : 'seed-guest';
		return [
			'email'       => sprintf( '%s-%d@%s', $prefix, $idx, self::SEED_GUEST_EMAIL_DOMAIN ),
			'first_name'  => $first_names[ array_rand( $first_names ) ],
			'last_name'   => $last_names[ array_rand( $last_names ) ],
			'is_registered' => $is_registered,
			'user_id'     => 0, // created lazily on first order if registered
			'order_dates' => $order_dates,
		];
	}

	/**
	 * Pop the first customer index assigned to $date, returning the record.
	 * If none pre-assigned (should not happen if plan is consistent),
	 * falls back to generating a fresh guest customer.
	 */
	private function take_customer_for_day( &$day_customers, $date_str ) {
		if ( ! empty( $day_customers ) ) {
			$idx = array_shift( $day_customers );
			return $this->customer_slots[ $idx ];
		}
		// Fallback — emit a guest inline.
		return $this->make_customer_record( 99999 + mt_rand( 0, 999999 ), [ $date_str ] );
	}

	// ---------------------------------------------------------------------
	// Order creation — SEED-05 (HPOS-safe via wc_create_order)
	// ---------------------------------------------------------------------

	private function create_order( $dt_utc, $customer, $items, $status_key, $payment ) {

		// Resolve (or lazily create) the WP user for registered customers.
		$customer_user_id = 0;
		if ( ! empty( $customer['is_registered'] ) ) {
			$customer_user_id = $this->resolve_or_create_user( $customer );
		}

		$order = wc_create_order( [
			'status'      => str_replace( 'wc-', '', $status_key ),
			'customer_id' => $customer_user_id,
			'created_via' => 'kmn_seed',
		] );
		if ( is_wp_error( $order ) ) {
			throw new \RuntimeException( $order->get_error_message() );
		}

		foreach ( $items as $it ) {
			$product = wc_get_product( $it['product_id'] );
			if ( $product ) {
				$order->add_product( $product, $it['qty'] );
			}
		}

		$order->set_billing_email( $customer['email'] );
		$order->set_billing_first_name( $customer['first_name'] );
		$order->set_billing_last_name( $customer['last_name'] );
		$order->set_billing_country( 'AT' );
		$order->set_billing_city( 'Salzburg' );
		$order->set_payment_method( $payment['key'] );
		$order->set_payment_method_title( $payment['title'] );

		// Backdate to synthetic historical datetime (UTC). Construct
		// without specifying the timezone arg — WC_DateTime accepts a
		// numeric offset as second arg, not a DateTimeZone in 9.x. Use
		// the ISO-ish string path instead.
		$order->set_date_created( strtotime( $dt_utc . ' UTC' ) );

		$order->calculate_totals();

		// Tag and save.
		$order->update_meta_data( self::META_TEST_ORDER, 1 );
		$order->save();

		return $order;
	}

	/**
	 * Memoise created users by email to avoid duplicate creation across
	 * repeat orders from the same customer.
	 */
	private $user_id_cache = [];

	private function resolve_or_create_user( $customer ) {
		$email = $customer['email'];
		if ( isset( $this->user_id_cache[ $email ] ) ) {
			return $this->user_id_cache[ $email ];
		}
		$existing = get_user_by( 'email', $email );
		if ( $existing instanceof WP_User ) {
			$this->user_id_cache[ $email ] = $existing->ID;
			return $existing->ID;
		}
		$login = 'seed_' . preg_replace( '/[^a-z0-9]+/i', '_', explode( '@', $email )[0] );
		$uid   = wp_insert_user( [
			'user_login' => substr( $login, 0, 60 ),
			'user_email' => $email,
			'user_pass'  => wp_generate_password( 20 ),
			'first_name' => $customer['first_name'],
			'last_name'  => $customer['last_name'],
			'role'       => 'customer',
		] );
		if ( is_wp_error( $uid ) ) {
			$this->user_id_cache[ $email ] = 0;
			return 0;
		}
		update_user_meta( $uid, self::META_TEST_USER, 1 );
		$this->user_id_cache[ $email ] = $uid;
		return $uid;
	}

	// ---------------------------------------------------------------------
	// Payment method picker
	// ---------------------------------------------------------------------

	private function pick_payment_method() {
		$weights = [];
		foreach ( self::PAYMENT_METHODS as $idx => $m ) {
			$weights[ $idx ] = $m['share'];
		}
		$idx = (int) $this->weighted_pick( $weights );
		return self::PAYMENT_METHODS[ $idx ];
	}

	// ---------------------------------------------------------------------
	// Weighted random picker
	// ---------------------------------------------------------------------

	/**
	 * Given a numeric $weights map (key => weight), returns a key selected
	 * proportionally to its weight. Accepts int or float weights.
	 */
	private function weighted_pick( $weights ) {
		$sum = 0.0;
		foreach ( $weights as $w ) {
			$sum += max( 0.0, (float) $w );
		}
		if ( $sum <= 0 ) {
			$keys = array_keys( $weights );
			return $keys[ array_rand( $keys ) ];
		}
		$r   = ( mt_rand( 0, PHP_INT_MAX ) / PHP_INT_MAX ) * $sum;
		$acc = 0.0;
		foreach ( $weights as $key => $w ) {
			$acc += max( 0.0, (float) $w );
			if ( $r <= $acc ) {
				return $key;
			}
		}
		return array_key_last( $weights );
	}

	// ---------------------------------------------------------------------
	// Dry-run summary
	// ---------------------------------------------------------------------

	private function print_plan_summary( $daily_plan, $repeat_rate, $multi_item ) {
		$total = array_sum( $daily_plan );
		$days  = count( $daily_plan );

		// DOW tallies.
		$by_dow = [ 'Mon' => 0, 'Tue' => 0, 'Wed' => 0, 'Thu' => 0, 'Fri' => 0, 'Sat' => 0, 'Sun' => 0 ];
		foreach ( $daily_plan as $d => $n ) {
			$dow = date( 'D', strtotime( $d ) );
			$by_dow[ $dow ] = ( $by_dow[ $dow ] ?? 0 ) + $n;
		}

		WP_CLI::log( '' );
		WP_CLI::log( '=== DRY RUN PLAN ===' );
		WP_CLI::log( sprintf( 'Window:        %d days (%s → %s)',
			$days, array_key_first( $daily_plan ), array_key_last( $daily_plan )
		) );
		WP_CLI::log( sprintf( 'Total orders:  %d', $total ) );
		WP_CLI::log( sprintf( 'Customers:     %d unique', count( $this->customer_slots ) ) );
		WP_CLI::log( sprintf( 'Repeat rate:   %0.1f%% (%d repeat customers)',
			$repeat_rate * 100,
			count( array_filter( $this->customer_slots, fn( $c ) => count( $c['order_dates'] ) >= 2 ) )
		) );
		WP_CLI::log( sprintf( 'Multi-item:    %0.1f%% target', $multi_item * 100 ) );
		WP_CLI::log( '' );
		WP_CLI::log( 'DOW split:' );
		foreach ( $by_dow as $dow => $n ) {
			$pct = $total > 0 ? ( $n / $total * 100 ) : 0;
			WP_CLI::log( sprintf( '  %s: %4d orders  (%0.1f%%)', $dow, $n, $pct ) );
		}
		WP_CLI::log( '' );
		WP_CLI::log( 'Status split (projected):' );
		foreach ( self::STATUS_SHARES as $s => $share ) {
			WP_CLI::log( sprintf( '  %-14s %4d  (%0.0f%%)', $s, (int) round( $total * $share ), $share * 100 ) );
		}
		WP_CLI::log( '' );
		WP_CLI::log( 'No writes performed. Re-run without --dry-run to seed.' );
	}
}

// Register command. Public WP-CLI contract: `wp kmn seed ...`
WP_CLI::add_command( 'kmn', 'KMN_Seeder_Command' );
