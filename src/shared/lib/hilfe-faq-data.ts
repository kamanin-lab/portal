// src/shared/lib/hilfe-faq-data.ts

export interface FaqItemData {
  question: string
  answer: string
}

export interface FaqSectionData {
  id: string
  title: string
  iconName: string   // Hugeicons export name — resolved at component level
  items: FaqItemData[]
}

export const FAQ_SECTIONS: FaqSectionData[] = [
  {
    id: 'projekte',
    title: 'Projekte',
    iconName: 'FolderOpenIcon',
    items: [
      {
        question: 'Was bedeuten die Projektphasen?',
        answer:
          'Jedes Projekt durchläuft vier Phasen: Konzept, Struktur, Design und Entwicklung. Diese helfen Ihnen, den Fortschritt auf einen Blick zu verfolgen. Jede Phase enthält Aufgaben, die schrittweise abgeschlossen werden.',
      },
      {
        question: 'Wie verfolge ich den Fortschritt meines Projekts?',
        answer:
          'Im Projektbereich sehen Sie alle Phasen und deren Aufgaben mit aktuellem Status. Abgeschlossene Schritte werden farblich markiert.',
      },
      {
        question: 'Was bedeutet „Ihre Rückmeldung"?',
        answer:
          'Dieser Status zeigt an, dass eine Aufgabe Ihre Freigabe oder Ihr Feedback benötigt, bevor wir weitermachen können. Bitte reagieren Sie zeitnah, damit sich Ihr Projekt nicht verzögert.',
      },
      {
        question: 'Wie erteile ich eine Freigabe oder fordere Änderungen an?',
        answer:
          'Öffnen Sie die entsprechende Aufgabe und klicken Sie auf „Freigeben". Wenn Sie Änderungen wünschen, wählen Sie „Änderungen anfordern" und beschreiben Sie Ihre Anmerkungen.',
      },
    ],
  },
  {
    id: 'tickets',
    title: 'Tickets & Anfragen',
    iconName: 'CustomerService01Icon',
    items: [
      {
        question: 'Wie erstelle ich ein neues Support-Ticket?',
        answer:
          'Klicken Sie auf „Neue Anfrage" im Bereich Tickets. Füllen Sie den Titel, die Beschreibung und die Priorität aus und bestätigen Sie mit „Senden".',
      },
      {
        question: 'Welche Prioritätsstufen gibt es?',
        answer:
          'Es gibt vier Stufen: Niedrig, Normal, Hoch und Dringend. Dringend ist für kritische Probleme, die sofortige Aufmerksamkeit erfordern. Bitte nutzen Sie diese Stufe nur wenn wirklich nötig.',
      },
      {
        question: 'Wie verfolge ich den Status meiner Anfragen?',
        answer:
          'Im Bereich Tickets sehen Sie alle Ihre Anfragen mit aktuellem Status (Offen, In Bearbeitung, Ihre Rückmeldung, Abgeschlossen). Sie erhalten eine Benachrichtigung bei jeder Statusänderung.',
      },
      {
        question: 'Kann ich einem Ticket eine Nachricht anhängen?',
        answer:
          'Ja. Öffnen Sie das Ticket und verwenden Sie das Kommentarfeld, um Nachrichten oder zusätzliche Informationen hinzuzufügen.',
      },
    ],
  },
  {
    id: 'dateien',
    title: 'Dateien',
    iconName: 'FolderCloudIcon',
    items: [
      {
        question: 'Wo finde ich meine Projektdateien?',
        answer:
          'Im Projektbereich unter dem Tab „Dateien". Alle Dokumente, Designs und Lieferobjekte werden dort organisiert.',
      },
      {
        question: 'Wie lade ich eine Datei hoch?',
        answer:
          'Navigieren Sie zum Dateien-Tab und klicken Sie auf „Datei hochladen". Sie können einzelne Dateien oder mehrere gleichzeitig hochladen.',
      },
      {
        question: 'Kann ich Ordner erstellen?',
        answer:
          'Ja. Klicken Sie auf „Neuer Ordner", geben Sie einen Namen ein und bestätigen Sie. Ordner helfen Ihnen, Dateien thematisch zu strukturieren.',
      },
      {
        question: 'Welche Dateiformate werden unterstützt?',
        answer:
          'Das Portal unterstützt gängige Formate wie PDF, DOCX, XLSX, PNG, JPG, ZIP und viele weitere. Bei speziellen Formaten wenden Sie sich bitte an uns.',
      },
    ],
  },
  {
    id: 'kredite',
    title: 'Kredite',
    iconName: 'CreditCardIcon',
    items: [
      {
        question: 'Was sind Kredite und wie funktionieren sie?',
        answer:
          'Kredite sind Ihr Guthaben für Leistungen von KAMANIN. Jede Anfrage oder Aufgabe verbraucht je nach Aufwand eine bestimmte Anzahl an Krediten.',
      },
      {
        question: 'Wo sehe ich mein aktuelles Guthaben?',
        answer:
          'Ihr aktuelles Kreditguthaben wird in der Seitenleiste angezeigt. Detaillierte Informationen finden Sie unter Konto → Kredite.',
      },
      {
        question: 'Was passiert, wenn mein Guthaben aufgebraucht ist?',
        answer:
          'Bei niedrigem Guthaben erhalten Sie eine Benachrichtigung. Wenden Sie sich an uns, um Ihr Paket aufzustocken. Laufende Projekte werden nicht unterbrochen.',
      },
    ],
  },
  {
    id: 'benachrichtigungen',
    title: 'Benachrichtigungen',
    iconName: 'Notification01Icon',
    items: [
      {
        question: 'Wann erhalte ich eine Benachrichtigung?',
        answer:
          'Sie erhalten Benachrichtigungen bei Statusänderungen Ihrer Tickets, neuen Kommentaren, Freigabeanfragen und wichtigen Projektaktualisierungen.',
      },
      {
        question: 'Wie markiere ich Benachrichtigungen als gelesen?',
        answer:
          'Öffnen Sie den Benachrichtigungsbereich (Glocke-Symbol) und klicken Sie auf eine Benachrichtigung, um sie zu lesen. Sie können auch alle auf einmal als gelesen markieren.',
      },
    ],
  },
  {
    id: 'konto',
    title: 'Konto & Einstellungen',
    iconName: 'UserCircleIcon',
    items: [
      {
        question: 'Wie ändere ich mein Passwort?',
        answer:
          'Gehen Sie zu Konto (unten links in der Seitenleiste) und wählen Sie „Passwort ändern". Sie erhalten eine E-Mail mit einem Link zum Zurücksetzen.',
      },
      {
        question: 'Wie aktualisiere ich meine E-Mail-Adresse?',
        answer:
          'Unter Konto → Profil können Sie Ihre E-Mail-Adresse ändern. Sie erhalten eine Bestätigungsmail an die neue Adresse.',
      },
      {
        question: 'Wie melde ich mich ab?',
        answer:
          'Klicken Sie auf Ihr Profilbild unten in der Seitenleiste und wählen Sie „Abmelden".',
      },
    ],
  },
]
