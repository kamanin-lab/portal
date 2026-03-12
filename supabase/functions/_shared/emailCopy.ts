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
        `„<strong>${taskName}</strong>“ ist bereit für Ihre Überprüfung.`,
      cta: "Im Portal ansehen",
    },
    en: {
      subject: (taskName: string) => `Task ready for review: ${taskName}`,
      title: "Task ready for review",
      greeting: greetEn,
      body: (taskName: string) =>
        `"<strong>${taskName}</strong>" is ready for your review.`,
      cta: "View in portal",
    },
  },

  task_completed: {
    de: {
      subject: "Ihre Aufgabe wurde abgeschlossen ✅",
      title: "Aufgabe abgeschlossen 🎉",
      greeting: greetDe,
      body: (taskName: string) => [
        `Wir haben Ihre Aufgabe „<strong>${taskName}</strong>“ abgeschlossen.`,
        `Die Arbeit ist finalisiert und vollständig erledigt.<br/>Falls Sie Folgeanfragen haben oder mit einer neuen Aufgabe fortfahren möchten, sind Sie herzlich eingeladen.`,
      ],
      cta: "Im Portal ansehen",
      secondaryCta: "Neue Aufgabe erstellen",
      signOff: "Mit freundlichen Grüßen,<br/>Ihr Tech-Team",
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
    },
  },

  message_digest: {
    de: {
      subject: "Sie haben neue Nachrichten",
      title: "Neue Nachrichten",
      greeting: greetDe,
      body: "Während Ihrer Abwesenheit gab es neue Antworten zu Ihren Aufgaben:",
      cta: "Alle im Portal ansehen",
    },
    en: {
      subject: "You have new messages",
      title: "New messages",
      greeting: greetEn,
      body: "While you were away, there were new replies on your tasks:",
      cta: "View all in portal",
    },
  },

  team_question: {
    de: {
      subject: (taskName: string) => `Frage zu „${taskName}“`,
      title: "Ihr Tech-Team hat eine Frage",
      greeting: greetDe,
      body: (teamMemberName: string, taskName: string) =>
        `${teamMemberName} hat eine Frage zu „<strong>${taskName}</strong>“:`,
      cta: "Im Portal antworten",
    },
    en: {
      subject: (taskName: string) => `Question about "${taskName}"`,
      title: "Your tech team has a question",
      greeting: greetEn,
      body: (teamMemberName: string, taskName: string) =>
        `${teamMemberName} has a question about "<strong>${taskName}</strong>":`,
      cta: "Reply in portal",
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
    },
    en: {
      subject: "New message from your tech team",
      title: "New support message",
      greeting: greetEn,
      body: (teamMemberName: string) =>
        `${teamMemberName} sent you a message:`,
      cta: "View in portal",
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
};

/**
 * Get copy for a given email type and locale.
 * Defaults to "de" if locale is missing or invalid.
 */
export function getEmailCopy(type: EmailType, locale?: string): EmailCopyEntry {
  const validLocale: EmailLocale = locale === "en" ? "en" : "de";
  return EMAIL_COPY[type]?.[validLocale] ?? EMAIL_COPY[type]["de"];
}
