/**
 * Shared email copy dictionary for all email types.
 * Default locale: "de" (German). English ("en") available for future use.
 */

export type EmailLocale = "de" | "en";
export type EmailType =
  | "task_review"
  | "task_completed"
  | "message_digest"
  | "team_question"
  | "support_response"
  | "step_ready"
  | "step_completed"
  | "project_reply"
  | "credit_approval"
  | "pending_reminder"
  | "project_reminder"
  | "unread_digest"
  | "new_recommendation"
  | "recommendation_reminder"
  | "weekly_summary"
  | "magic_link"
  | "password_reset"
  | "email_confirmation"
  | "signup"
  | "invite"
  | "email_change";

interface EmailCopyEntry {
  subject: string | ((...args: any[]) => string);
  title: string;
  greeting: string | ((firstName?: string) => string);
  body: string | string[] | ((...args: any[]) => string | string[]);
  cta: string;
  secondaryCta?: string;
  notes?: string[];
  signOff?: string;
}

type EmailCopyDict = Record<EmailType, Record<EmailLocale, EmailCopyEntry>>;

// Helper for German pluralization
export function deNewReplies(count: number): string {
  return count === 1 ? "1 neue Antwort" : `${count} neue Antworten`;
}

export function enNewReplies(count: number): string {
  return count === 1 ? "1 new reply" : `${count} new replies`;
}

// Greeting helpers (single source of truth)
const greetDe = (firstName?: string) =>
  firstName ? `Hallo ${firstName},` : "Hallo,";

const greetEn = (firstName?: string) =>
  firstName ? `Hi ${firstName},` : "Hi,";

export const EMAIL_COPY: EmailCopyDict = {
  task_review: {
    de: {
      subject: (taskName: string) => `Aufgabe bereit zur Überprüfung: ${taskName}`,
      title: "Aufgabe bereit zur Überprüfung",
      greeting: greetDe,
      body: (taskName: string) =>
        `„<strong>${taskName}</strong>" ist bereit für Ihre Überprüfung.`,
      cta: "Im Portal ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (taskName: string) => `Task ready for review: ${taskName}`,
      title: "Task ready for review",
      greeting: greetEn,
      body: (taskName: string) =>
        `"<strong>${taskName}</strong>" is ready for your review.`,
      cta: "View in portal",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  credit_approval: {
    de: {
      subject: (taskName: string, credits: string) => `Kostenfreigabe für ${taskName} — ${credits} Credits`,
      title: "Kostenfreigabe erforderlich",
      greeting: greetDe,
      body: (taskName: string, credits: string) =>
        `Die Aufgabe „<strong>${taskName}</strong>" wurde mit <strong>${credits} Credits</strong> bewertet und wartet auf Ihre Freigabe.`,
      cta: "Im Portal ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (taskName: string, credits: string) => `Credit approval for ${taskName} — ${credits} credits`,
      title: "Credit approval required",
      greeting: greetEn,
      body: (taskName: string, credits: string) =>
        `The task "<strong>${taskName}</strong>" has been estimated at <strong>${credits} credits</strong> and is awaiting your approval.`,
      cta: "View in portal",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  pending_reminder: {
    de: {
      subject: (count: number) =>
        `Erinnerung: ${count} ${count === 1 ? "Aufgabe wartet" : "Aufgaben warten"} auf Ihre Rückmeldung`,
      title: "Offene Aufgaben",
      greeting: greetDe,
      body: "Die folgenden Aufgaben warten auf Ihre Rückmeldung:",
      cta: "Im Portal ansehen",
      notes: [
        "Sie erhalten diese Erinnerung alle 5 Tage, solange offene Aufgaben bestehen.",
        "Sie können Erinnerungen in Ihren Kontoeinstellungen deaktivieren.",
      ],
    },
    en: {
      subject: (count: number) =>
        `Reminder: ${count} ${count === 1 ? "task awaits" : "tasks await"} your feedback`,
      title: "Pending tasks",
      greeting: greetEn,
      body: "The following tasks are waiting for your feedback:",
      cta: "View in portal",
      notes: [
        "You receive this reminder every 5 days while tasks are pending.",
        "You can disable reminders in your account settings.",
      ],
    },
  },

  project_reminder: {
    de: {
      subject: (count: number) =>
        `Erinnerung: ${count} Projektschritt${count === 1 ? '' : 'e'} warte${count === 1 ? 't' : 'n'} auf Ihre Rückmeldung`,
      title: "Offene Projektschritte",
      greeting: greetDe,
      body: "Die folgenden Projektschritte warten auf Ihre Rückmeldung:",
      cta: "Im Portal ansehen",
      notes: [
        "Sie erhalten diese Erinnerung alle 3 Tage, solange offene Projektschritte auf Ihre Freigabe warten.",
        "Sie können Erinnerungen in Ihren Kontoeinstellungen deaktivieren.",
      ],
    },
    en: {
      subject: (count: number) =>
        `Reminder: ${count} project step${count === 1 ? '' : 's'} await${count === 1 ? 's' : ''} your feedback`,
      title: "Pending project steps",
      greeting: greetEn,
      body: "The following project steps are waiting for your feedback:",
      cta: "View in portal",
      notes: [
        "You receive this reminder every 3 days while project steps are pending.",
        "You can disable reminders in your account settings.",
      ],
    },
  },

  unread_digest: {
    de: {
      subject: (count: number) =>
        count === 1
          ? "Eine ungelesene Nachricht in Ihrem Portal"
          : `${count} ungelesene Nachrichten in Ihrem Portal`,
      title: "Ungelesene Nachrichten",
      greeting: greetDe,
      body: "Sie haben ungelesene Nachrichten, die auf Ihre Antwort warten:",
      cta: "Im Portal ansehen",
      notes: [
        "Sie erhalten diese Erinnerung alle zwei Tage, solange ungelesene Nachrichten vorliegen.",
        "Sie können Erinnerungen in Ihren Kontoeinstellungen deaktivieren.",
      ],
    },
    en: {
      subject: (count: number) =>
        count === 1
          ? "One unread message in your portal"
          : `${count} unread messages in your portal`,
      title: "Unread Messages",
      greeting: greetEn,
      body: "You have unread messages waiting for your reply:",
      cta: "View in portal",
      notes: [
        "You receive this reminder every two days while unread messages remain.",
        "You can disable reminders in your account settings.",
      ],
    },
  },

  step_ready: {
    de: {
      subject: (stepName: string) => `${stepName} — Ihre Prüfung ist erforderlich`,
      title: "Projektschritt bereit zur Prüfung",
      greeting: greetDe,
      body: (stepName: string) =>
        `Der Projektschritt „<strong>${stepName}</strong>" ist bereit für Ihre Prüfung. Bitte sehen Sie sich die Ergebnisse an und geben Sie Ihr Feedback.`,
      cta: "Schritt öffnen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (stepName: string) => `${stepName} — Your review is required`,
      title: "Project step ready for review",
      greeting: greetEn,
      body: (stepName: string) =>
        `The project step "<strong>${stepName}</strong>" is ready for your review. Please review the deliverables and share your feedback.`,
      cta: "Open step",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  step_completed: {
    de: {
      subject: (chapterName: string) => `Projektschritt abgeschlossen: ${chapterName}`,
      title: "Projektschritt abgeschlossen",
      greeting: greetDe,
      body: (chapterName: string) => [
        `Der Schritt „<strong>${chapterName}</strong>" wurde erfolgreich abgeschlossen.`,
        `Alle Aufgaben in diesem Schritt sind fertig. Wir arbeiten jetzt am nächsten Schritt Ihres Projekts.`,
      ],
      cta: "Projekt ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (chapterName: string) => `Project step completed: ${chapterName}`,
      title: "Project step completed",
      greeting: greetEn,
      body: (chapterName: string) => [
        `The step "<strong>${chapterName}</strong>" has been successfully completed.`,
        `All tasks in this step are done. We are now working on the next step of your project.`,
      ],
      cta: "View project",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  project_reply: {
    de: {
      subject: (stepName: string) => `Neue Nachricht zu ${stepName}`,
      title: "Neue Nachricht zu Ihrem Projektschritt",
      greeting: greetDe,
      body: (teamMemberName: string, stepName: string) =>
        `${teamMemberName} hat eine Nachricht zu „<strong>${stepName}</strong>" hinterlassen:`,
      cta: "Nachricht ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (stepName: string) => `New message about ${stepName}`,
      title: "New message on your project step",
      greeting: greetEn,
      body: (teamMemberName: string, stepName: string) =>
        `${teamMemberName} left a message about "<strong>${stepName}</strong>":`,
      cta: "View message",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  task_completed: {
    de: {
      subject: "Ihre Aufgabe wurde abgeschlossen ✅",
      title: "Aufgabe abgeschlossen 🎉",
      greeting: greetDe,
      body: (taskName: string) => [
        `Wir haben Ihre Aufgabe „<strong>${taskName}</strong>" abgeschlossen.`,
        `Die Arbeit ist finalisiert und vollständig erledigt.<br/>Falls Sie Folgeanfragen haben oder mit einer neuen Aufgabe fortfahren möchten, sind Sie herzlich eingeladen.`,
      ],
      cta: "Im Portal ansehen",
      secondaryCta: "Neue Aufgabe erstellen",
      signOff: "Mit freundlichen Grüßen,<br/>Ihr Tech-Team",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: "Your task is completed ✅",
      title: "Task completed 🎉",
      greeting: greetEn,
      body: (taskName: string) => [
        `We've completed your task "<strong>${taskName}</strong>".`,
        `The work has been finalized and is now complete.<br/>If you have any follow-up requests or would like to continue with another task, you're very welcome to do so.`,
      ],
      cta: "View in portal",
      secondaryCta: "Create a new task",
      signOff: "Best regards,<br/>Your tech team",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  message_digest: {
    de: {
      subject: "Sie haben neue Nachrichten",
      title: "Neue Nachrichten",
      greeting: greetDe,
      body: "Während Ihrer Abwesenheit gab es neue Antworten zu Ihren Aufgaben:",
      cta: "Alle im Portal ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: "You have new messages",
      title: "New messages",
      greeting: greetEn,
      body: "While you were away, there were new replies on your tasks:",
      cta: "View all in portal",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  team_question: {
    de: {
      subject: (taskName: string) => `Nachricht zu „${taskName}"`,
      title: "Ihr Tech-Team hat eine Nachricht",
      greeting: greetDe,
      body: (teamMemberName: string, taskName: string) =>
        `${teamMemberName} hat eine Nachricht zu „<strong>${taskName}</strong>":`,
      cta: "Im Portal antworten",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (taskName: string) => `Question about "${taskName}"`,
      title: "Your tech team has a question",
      greeting: greetEn,
      body: (teamMemberName: string, taskName: string) =>
        `${teamMemberName} has a question about "<strong>${taskName}</strong>":`,
      cta: "Reply in portal",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  support_response: {
    de: {
      subject: "Neue Nachricht von Ihrem Tech-Team",
      title: "Neue Support-Nachricht",
      greeting: greetDe,
      body: (teamMemberName: string) =>
        `${teamMemberName} hat Ihnen eine Nachricht gesendet:`,
      cta: "Im Portal ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: "New message from your tech team",
      title: "New support message",
      greeting: greetEn,
      body: (teamMemberName: string) =>
        `${teamMemberName} sent you a message:`,
      cta: "View in portal",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  magic_link: {
    de: {
      subject: "Anmeldung im KAMANIN Portal",
      title: "Anmelden",
      greeting: greetDe,
      body:
        "Klicken Sie auf die Schaltfläche unten, um sich in Ihrem Portal anzumelden:",
      cta: "Anmelden",
      notes: [
        "Dieser Link läuft in 1 Stunde ab.",
        "Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "Sign in to the KAMANIN portal",
      title: "Sign in",
      greeting: greetEn,
      body:
        "Click the button below to sign in to your client portal:",
      cta: "Sign in",
      notes: [
        "This link expires in 1 hour.",
        "If you didn't request this, you can safely ignore this email.",
      ],
    },
  },

  password_reset: {
    de: {
      subject: "Passwort zurücksetzen",
      title: "Passwort zurücksetzen",
      greeting: greetDe,
      body:
        "Sie haben angefordert, Ihr Passwort zurückzusetzen. Klicken Sie unten, um ein neues Passwort festzulegen:",
      cta: "Passwort zurücksetzen",
      notes: [
        "Dieser Link läuft in 1 Stunde ab.",
        "Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "Reset your password",
      title: "Reset your password",
      greeting: greetEn,
      body:
        "You requested to reset your password. Click below to set a new one:",
      cta: "Reset password",
      notes: [
        "This link expires in 1 hour.",
        "If you didn't request this, you can safely ignore this email.",
      ],
    },
  },

  email_confirmation: {
    de: {
      subject: "E-Mail-Adresse bestätigen",
      title: "E-Mail bestätigen",
      greeting: greetDe,
      body:
        "Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf die Schaltfläche unten klicken:",
      cta: "E-Mail bestätigen",
      notes: [
        "Falls Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "Confirm your email address",
      title: "Confirm your email",
      greeting: greetEn,
      body:
        "Please confirm your email address by clicking the button below:",
      cta: "Confirm email",
      notes: [
        "If you didn't create an account, you can safely ignore this email.",
      ],
    },
  },

  signup: {
    de: {
      subject: "E-Mail-Adresse bestätigen",
      title: "E-Mail bestätigen",
      greeting: greetDe,
      body:
        "Vielen Dank für Ihre Registrierung! Bitte bestätigen Sie Ihre E-Mail-Adresse:",
      cta: "E-Mail bestätigen",
      notes: [
        "Falls Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "Confirm your email",
      title: "Confirm Your Email",
      greeting: greetEn,
      body:
        "Thanks for signing up! Please confirm your email address by clicking the button below:",
      cta: "Confirm Email",
      notes: [
        "If you didn't create an account, you can safely ignore this email.",
      ],
    },
  },

  invite: {
    de: {
      subject: "Einladung zum KAMANIN Portal",
      title: "Sie wurden eingeladen",
      greeting: greetDe,
      body:
        "Sie wurden eingeladen, dem KAMANIN Client Portal beizutreten. Klicken Sie unten, um die Einladung anzunehmen und Ihr Konto einzurichten:",
      cta: "Einladung annehmen",
      notes: [
        "Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "You've been invited to KAMANIN Portal",
      title: "You're Invited",
      greeting: greetEn,
      body:
        "You've been invited to join the KAMANIN Client Portal. Click below to accept and set up your account:",
      cta: "Accept Invitation",
      notes: [
        "If you weren't expecting this invitation, you can safely ignore this email.",
      ],
    },
  },

  email_change: {
    de: {
      subject: "Neue E-Mail-Adresse bestätigen",
      title: "E-Mail-Änderung bestätigen",
      greeting: greetDe,
      body:
        "Sie haben eine Änderung Ihrer E-Mail-Adresse angefordert. Klicken Sie unten zur Bestätigung:",
      cta: "E-Mail-Änderung bestätigen",
      notes: [
        "Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.",
      ],
    },
    en: {
      subject: "Confirm your new email",
      title: "Confirm Email Change",
      greeting: greetEn,
      body:
        "You requested to change your email address. Click below to confirm:",
      cta: "Confirm Email Change",
      notes: [
        "If you didn't request this, you can safely ignore this email.",
      ],
    },
  },

  recommendation_reminder: {
    de: {
      subject: (count: number) =>
        `Erinnerung: ${count} offene Empfehlung${count === 1 ? '' : 'en'} warte${count === 1 ? 't' : 'n'} auf Ihre Entscheidung`,
      title: "Offene Empfehlungen",
      greeting: greetDe,
      body: "Die folgenden Empfehlungen unseres Teams warten auf Ihre Entscheidung:",
      cta: "Im Portal ansehen",
      notes: [
        "Sie erhalten diese Erinnerung alle 5 Tage, solange offene Empfehlungen bestehen.",
        "Sie können Erinnerungen in Ihren Kontoeinstellungen deaktivieren.",
      ],
    },
    en: {
      subject: (count: number) =>
        `Reminder: ${count} pending recommendation${count === 1 ? '' : 's'} await${count === 1 ? 's' : ''} your decision`,
      title: "Pending recommendations",
      greeting: greetEn,
      body: "The following recommendations from our team are waiting for your decision:",
      cta: "Open in portal",
      notes: [
        "You receive this reminder every 5 days while recommendations remain pending.",
        "You can disable reminders in your account settings.",
      ],
    },
  },

  new_recommendation: {
    de: {
      subject: (taskName: string) => "Neue Empfehlung: " + taskName,
      title: "Neue Empfehlung",
      greeting: greetDe,
      body: (taskName: string) =>
        "Unser Team hat eine neue Empfehlung für Sie erstellt: \"<strong>" + taskName + "</strong>\". Bitte sehen Sie sich den Vorschlag an und entscheiden Sie, ob Sie ihn annehmen möchten.",
      cta: "Empfehlung ansehen",
      notes: [
        "Sie können E-Mail-Benachrichtigungen in Ihren Kontoeinstellungen anpassen.",
      ],
    },
    en: {
      subject: (taskName: string) => "New recommendation: " + taskName,
      title: "New Recommendation",
      greeting: greetEn,
      body: (taskName: string) =>
        "Your team has created a new recommendation for you: \"<strong>" + taskName + "</strong>\". Please review the suggestion and decide if you'd like to accept it.",
      cta: "View recommendation",
      notes: [
        "You can adjust your email notification preferences in your account settings.",
      ],
    },
  },

  weekly_summary: {
    de: {
      subject: (isoWeek: number) => `Wochenbericht — KW ${isoWeek}`,
      title: "Ihr Wochenbericht",
      greeting: greetDe,
      body: "Hier ist der Überblick über die vergangene Woche in Ihrem Portal:",
      cta: "Im Portal ansehen",
      notes: [
        "Sie erhalten diese Zusammenfassung jeden Montag, wenn es etwas zu berichten gibt.",
        "Sie können die wöchentliche Zusammenfassung in Ihren Kontoeinstellungen deaktivieren.",
      ],
    },
    en: {
      subject: (isoWeek: number) => `Weekly summary — Week ${isoWeek}`,
      title: "Your weekly summary",
      greeting: greetEn,
      body: "Here is an overview of the past week in your portal:",
      cta: "View in portal",
      notes: [
        "You receive this summary every Monday when there is something to report.",
        "You can disable the weekly summary in your account settings.",
      ],
    },
  },
};

/**
 * Get copy for a given email type and locale.
 * Defaults to "de" if locale is missing or invalid.
 */
export function getEmailCopy(type: EmailType, locale?: string): EmailCopyEntry {
  const validLocale: EmailLocale = locale === "en" ? "en" : "de";
  return EMAIL_COPY[type]?.[validLocale] ?? EMAIL_COPY[type]["de"];
}
