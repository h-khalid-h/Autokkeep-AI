import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-brand-name">
              <div className="navbar-logo-icon">AK</div>
              Auto<span className="text-gradient">kkeep</span>
            </div>
            <p className="footer-brand-desc">
              The end of the monthly close. Autonomous AI-native bookkeeping for modern businesses. Built for CPA firms and high-growth companies.
            </p>
          </div>

          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <a href="/#solution" className="footer-link">How It Works</a>
              <a href="/#architecture" className="footer-link">Architecture</a>
              <a href="/#pricing" className="footer-link">Pricing</a>
              <Link href="/dashboard" className="footer-link">Live Dashboard Demo</Link>
              <Link href="/demo/shadow-audit" className="footer-link">Shadow Audit Demo</Link>
              <a href="/#cta" className="footer-link">Request Access</a>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <Link href="/about" className="footer-link">About</Link>
              <Link href="/partners" className="footer-link">Partners</Link>
              <Link href="/resources" className="footer-link">Resources</Link>
              <Link href="/contact" className="footer-link">Contact</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Legal & Security</div>
            <div className="footer-links">
              <Link href="/security" className="footer-link">Security Overview</Link>
              <Link href="/privacy" className="footer-link">Privacy Policy</Link>
              <Link href="/terms" className="footer-link">Terms of Service</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Autokkeep, Inc. All rights reserved.</span>
          <span>Built with precision. Powered by AI.</span>
        </div>
      </div>
    </footer>
  );
}
