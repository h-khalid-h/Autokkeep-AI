import Link from 'next/link';
import Logo from '@/components/ui/Logo';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-brand-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Logo size={28} />
              <span>Auto<span className="text-gradient">kkeep</span></span>
            </div>
            <p className="footer-brand-desc">
              Understand your business finances without understanding accounting. AI-powered financial operations for small businesses.
            </p>
          </div>

          <div>
            <div className="footer-col-title">Product</div>
            <div className="footer-links">
              <Link href="/#solution" className="footer-link">How It Works</Link>
              <Link href="/#architecture" className="footer-link">Architecture</Link>
              <Link href="/pricing" className="footer-link">Pricing</Link>
              <Link href="/dashboard" className="footer-link">Live Dashboard Demo</Link>
              <Link href="/demo/shadow-audit" className="footer-link">Shadow Audit Demo</Link>
              <Link href="/#cta" className="footer-link">Request Access</Link>
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
