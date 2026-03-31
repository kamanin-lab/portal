# Design Spec: Hilfe & FAQ Page

**Date:** 2026-03-31
**Status:** Approved
**Route:** `/hilfe`

---

## Context

The Help page (`/hilfe`) is currently a placeholder ("wird aufgebaut"). Clients need a self-service FAQ page to answer recurring questions about portal features (projects, tickets, files, credits, notifications, account). No search, no contact block — pure informational FAQ with accordion UX.

---

## Approach

Variant A: **Grouped sections** — each category is a `bg-surface` card with an icon + heading and accordion items inside. Matches existing KontoPage / ProfileSection patterns exactly. Independent accordion items (each opens/closes separately).

---

## Component Architecture

### New files

| File | Purpose |
|------|---------|
| `src/shared/components/help/FaqItem.tsx` | Single accordion item: question button + animated answer |
| `src/shared/components/help/FaqSection.tsx` | Section card: icon + heading + list of FaqItem |
| `src/shared/lib/hilfe-faq-data.ts` | Typed FAQ data (sections array) |

### Modified files

| File | Change |
|------|--------|
| `src/shared/pages/HilfePage.tsx` | Replace placeholder with full page layout |

---

## Data Structure

```ts
// src/shared/lib/hilfe-faq-data.ts

export interface FaqItemData {
  question: string;
  answer: string;
}

export interface FaqSectionData {
  id: string;
  title: string;
  icon: IconComponent; // Hugeicons icon
  items: FaqItemData[];
}

export const FAQ_SECTIONS: FaqSectionData[] = [ /* see Content section */ ];
```

---

## Component Specs

### FaqItem

```
<button> — full width, flex row, justify-between, items-center
  <span> question — text-sm font-medium text-text-primary
  <ChevronDown> — rotates 180° when open, transition 0.2s

<AnimatePresence>
  <motion.div> answer — text-sm text-text-secondary, leading-relaxed
    initial: { height: 0, opacity: 0 }
    animate: { height: "auto", opacity: 1 }
    exit:    { height: 0, opacity: 0 }
    transition: { duration: 0.2, ease: "easeInOut" }
    inner div: pt-2 pb-3 px-0
```

- State: `useState<boolean>(false)` — independent per item
- Separator: `border-b border-[var(--border-light)]` between items (not after last)
- Button hover: `hover:bg-[var(--surface-hover)]` with `rounded-[var(--r-sm)]`
- Button padding: `py-3 w-full`

### FaqSection

```
<section> — bg-[var(--surface)] rounded-[14px] border border-[var(--border)] p-5
  <div> header — flex items-center gap-2 mb-3
    <HugeiconsIcon> — size={18} className="text-[var(--text-secondary)]"
    <h2> — text-sm font-semibold text-[var(--text-primary)]
  <div> — border-b border-[var(--border)] mb-1
  <div> items — flex flex-col (no gap, separators handle spacing)
    FaqItem × N
```

### HilfePage

```
<ContentContainer width="narrow">
  <div> — p-6 max-[768px]:p-4 flex flex-col gap-5
    <div> header
      <h1> — text-xl font-semibold text-[var(--text-primary)] — "Hilfe & FAQ"
      <p>  — mt-1 text-sm text-[var(--text-secondary)] — "Antworten auf häufige Fragen zum Portal"
    {FAQ_SECTIONS.map(section =>
      <motion.div>  ← stagger wrapper
        <FaqSection key={section.id} section={section} />
    )}
```

**Section entry animation:**
```ts
initial: { opacity: 0, y: 8 }
whileInView: { opacity: 1, y: 0 }
viewport: { once: true, margin: "-40px" }
transition: { duration: 0.3, delay: index * 0.05 }
```

---

## Content

### 1. Projekte — `FolderOpen01Icon`

| Frage | Antwort |
|-------|---------|
| Was bedeuten die Projektphasen? | Jedes Projekt durchläuft vier Phasen: Konzept, Struktur, Design und Entwicklung. Diese helfen Ihnen, den Fortschritt auf einen Blick zu verfolgen. Jede Phase enthält Aufgaben, die schrittweise abgeschlossen werden. |
| Wie verfolge ich den Fortschritt? | Im Projektbereich sehen Sie alle Phasen und deren Aufgaben mit aktuellem Status. Abgeschlossene Schritte werden farblich markiert. |
| Was bedeutet „Ihre Rückmeldung"? | Dieser Status zeigt an, dass eine Aufgabe Ihre Freigabe oder Ihr Feedback benötigt, bevor wir weitermachen können. Bitte reagieren Sie zeitnah, damit sich Ihr Projekt nicht verzögert. |
| Wie erteile ich eine Freigabe? | Öffnen Sie die entsprechende Aufgabe und klicken Sie auf „Freigeben". Wenn Sie Änderungen wünschen, wählen Sie „Änderungen anfordern" und beschreiben Sie Ihre Anmerkungen. |

### 2. Tickets & Anfragen — `CustomerService01Icon`

| Frage | Antwort |
|-------|---------|
| Wie erstelle ich ein neues Ticket? | Klicken Sie auf „Neue Anfrage" im Bereich Tickets. Füllen Sie den Titel, die Beschreibung und die Priorität aus und bestätigen Sie mit „Senden". |
| Welche Prioritätsstufen gibt es? | Es gibt vier Stufen: Niedrig, Normal, Hoch und Dringend. Dringend ist für kritische Probleme, die sofortige Aufmerksamkeit erfordern. Bitte nutzen Sie diese Stufe nur wenn wirklich nötig. |
| Wie verfolge ich den Status meiner Anfragen? | Im Bereich Tickets sehen Sie alle Ihre Anfragen mit aktuellem Status (Offen, In Bearbeitung, Ihre Rückmeldung, Abgeschlossen). Sie erhalten eine Benachrichtigung bei jeder Statusänderung. |
| Kann ich einem Ticket eine Nachricht anhängen? | Ja. Öffnen Sie das Ticket und verwenden Sie das Kommentarfeld, um Nachrichten oder zusätzliche Informationen hinzuzufügen. |

### 3. Dateien — `FolderCloudIcon`

| Frage | Antwort |
|-------|---------|
| Wo finde ich meine Projektdateien? | Im Projektbereich unter dem Tab „Dateien". Alle Dokumente, Designs und Lieferobjekte werden dort organisiert. |
| Wie lade ich eine Datei hoch? | Navigieren Sie zum Dateien-Tab und klicken Sie auf „Datei hochladen". Sie können einzelne Dateien oder mehrere gleichzeitig hochladen. |
| Kann ich Ordner erstellen? | Ja. Klicken Sie auf „Neuer Ordner", geben Sie einen Namen ein und bestätigen Sie. Ordner helfen Ihnen, Dateien thematisch zu strukturieren. |
| Welche Dateiformate werden unterstützt? | Das Portal unterstützt gängige Formate wie PDF, DOCX, XLSX, PNG, JPG, ZIP und viele weitere. Bei speziellen Formaten wenden Sie sich bitte an uns. |

### 4. Kredite — `CreditCardIcon`

| Frage | Antwort |
|-------|---------|
| Was sind Kredite und wie funktionieren sie? | Kredite sind Ihr Guthaben für Leistungen von KAMANIN. Jede Anfrage oder Aufgabe verbraucht je nach Aufwand eine bestimmte Anzahl an Krediten. |
| Wo sehe ich mein Guthaben? | Ihr aktuelles Kreditguthaben wird in der Seitenleiste angezeigt. Detaillierte Informationen finden Sie unter Konto → Kredite. |
| Was passiert, wenn das Guthaben aufgebraucht ist? | Bei niedrigem Guthaben erhalten Sie eine Benachrichtigung. Wenden Sie sich an uns, um Ihr Paket aufzustocken. Laufende Projekte werden nicht unterbrochen. |

### 5. Benachrichtigungen — `Notification01Icon`

| Frage | Antwort |
|-------|---------|
| Wann erhalte ich eine Benachrichtigung? | Sie erhalten Benachrichtigungen bei Statusänderungen Ihrer Tickets, neuen Kommentaren, Freigabeanfragen und wichtigen Projektaktualisierungen. |
| Wie markiere ich Benachrichtigungen als gelesen? | Öffnen Sie den Benachrichtigungsbereich (Glocke-Symbol) und klicken Sie auf eine Benachrichtigung, um sie zu lesen. Sie können auch alle auf einmal als gelesen markieren. |

### 6. Konto & Einstellungen — `UserCircleIcon`

| Frage | Antwort |
|-------|---------|
| Wie ändere ich mein Passwort? | Gehen Sie zu Konto (unten links in der Seitenleiste) und wählen Sie „Passwort ändern". Sie erhalten eine E-Mail mit einem Link zum Zurücksetzen. |
| Wie aktualisiere ich meine E-Mail-Adresse? | Unter Konto → Profil können Sie Ihre E-Mail-Adresse ändern. Sie erhalten eine Bestätigungsmail an die neue Adresse. |
| Wie melde ich mich ab? | Klicken Sie auf Ihr Profilbild unten in der Seitenleiste und wählen Sie „Abmelden". |

---

## Design Tokens Used

- `--surface`, `--surface-hover` — card and hover backgrounds
- `--border`, `--border-light` — card border and item separators
- `--text-primary`, `--text-secondary`, `--text-tertiary` — typography
- `--r-lg` (14px) — section card radius
- `--r-sm` (6px) — button hover radius

---

## Animation Summary

| Element | Pattern |
|---------|---------|
| Section cards (page load/scroll) | `whileInView` fade + y:8→0, stagger 0.05s per section, `once: true` |
| FAQ answer expand | `AnimatePresence`, height 0→auto, opacity 0→1, 0.2s easeInOut |
| Chevron icon | CSS `rotate-180` transition via Tailwind when open |

---

## Mobile Behavior

- `ContentContainer width="narrow"` handles centering
- Padding: `p-6` desktop → `max-[768px]:p-4` mobile
- Section cards: full width on mobile, readable on any screen size
- Touch targets: `py-3` on accordion buttons (≥44px effective height)

---

## Verification

1. `npm run dev` — navigate to `/hilfe`, verify all 6 sections render
2. Click each accordion item — verify smooth open/close animation
3. Verify chevron rotates 180° on open
4. Verify sections stagger-animate on scroll (or page load)
5. Resize to mobile (375px) — verify layout holds, touch targets comfortable
6. `npm run build` — no TypeScript errors
