const Footer = () => {
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container py-6">
        <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground md:flex-row md:justify-between">
          {/* Left side - Copyright & Version */}
          <div className="flex flex-col items-center gap-1 md:flex-row md:gap-4">
            <span>© 2026 Client Portal</span>
            <span className="hidden md:inline">·</span>
            <span>Version v1.1.0</span>
          </div>

          {/* Center - Legal Links */}
          <div className="flex items-center gap-2">
            <a
              href="https://kamanin.at/datenschutz"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors">

              Datenschutz
            </a>
            <span>·</span>
            <a
              href="https://kamanin.at/impressum"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors">

              Impressum
            </a>
            <span>·</span>
            <a href="mailto:support@kamanin.at" className="hover:text-foreground transition-colors">
              Support
            </a>
          </div>

          {/* Right side - Powered by */}
          <div>
            <span>Powered by </span>
            <a
              href="https://kamanin.at/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors">

              KAMANIN
            </a>
          </div>
        </div>
      </div>
    </footer>);

};

export default Footer;