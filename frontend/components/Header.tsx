"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Menu, X, Cloud } from "lucide-react";
import { useAuth, isAdminRole } from "@/lib/auth-context";
import { features } from "@/lib/features";

// Lazy load user profile dropdown
const UserProfileDropdown = dynamic(
  () => import('./UserProfileDropdown').then(mod => ({ default: mod.UserProfileDropdown })),
  { ssr: false }
);

interface NavItem {
  href: string;
  label: string;
}

const publicNav: NavItem[] = [
  { href: "/pricing", label: "Pricing" },
  { href: "/#features", label: "Features" },
  { href: "/contact", label: "Contact" },
];

const vpsNav: NavItem[] = [
  { href: "/vms", label: "VMs" },
  { href: "/solar", label: "Solar" },
  { href: "/billing", label: "Billing" },
];

const appNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/hosting", label: "Hosting" },
  { href: "/dashboard/subscription", label: "Subscription" },
  ...(features.vps ? vpsNav : []),
  { href: "/help", label: "Help" },
];

const adminNavItem: NavItem = { href: "/admin", label: "Admin" };

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { isAuthenticated, user, loading, logout } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  const navItems = isAuthenticated
    ? [...appNav, ...(isAdminRole(user?.role) ? [adminNavItem] : [])]
    : publicNav;

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return false;
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (href: string) =>
    cn(
      "hover:text-primary transition-colors",
      isActive(href) && "text-primary font-medium"
    );

  return (
    <header 
      className={cn(
        "fixed top-0 w-full z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-md border-b border-primary/10 shadow-xs py-2"
          : "bg-transparent border-b border-transparent py-4"
      )}
      role="banner"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2" aria-label="Sahary Cloud home">
          <div className="h-10 w-10 rounded-xl bg-linear-to-br from-primary/80 to-primary flex items-center justify-center transform rotate-12 hover:rotate-0 transition-transform duration-300">
            <Cloud size={24} className="text-white" />
          </div>
          <span className="font-bold text-xl md:text-2xl bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Sahary Cloud
          </span>
        </Link>

        <div className="hidden lg:flex items-center gap-6">
          <nav aria-label="Primary navigation">
            <ul className="flex items-center gap-6" role="list">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={navLinkClass(item.href)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
          {loading ? (
            <div className="h-9 w-9 rounded-full bg-muted animate-pulse" aria-hidden="true" />
          ) : isAuthenticated ? (
            <UserProfileDropdown />
          ) : (
            <>
              <Button asChild variant="outline" className="mr-2">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/register">Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        <div className="lg:hidden flex items-center gap-4">
          <ThemeToggle />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={toggleMenu} 
            aria-label={isOpen ? "Close menu" : "Open menu"}
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div 
          id="mobile-menu"
          className="lg:hidden absolute top-full left-0 w-full bg-background/95 backdrop-blur-md border-b border-primary/10 shadow-lg py-4 max-h-[calc(100vh-5rem)] overflow-y-auto"
        >
          <nav className="container mx-auto px-4" aria-label="Mobile navigation">
            <ul className="flex flex-col gap-4" role="list">
              {isAuthenticated && user && (
                <li className="pb-2 border-b">
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      {`${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="font-medium">{`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </li>
              )}
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn("block py-2", navLinkClass(item.href))}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {isAuthenticated && (
                <>
                  <li>
                    <Link
                      href="/profile"
                      className={cn("block py-2", navLinkClass("/profile"))}
                      onClick={() => setIsOpen(false)}
                    >
                      Profile
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/settings"
                      className={cn("block py-2", navLinkClass("/settings"))}
                      onClick={() => setIsOpen(false)}
                    >
                      Settings
                    </Link>
                  </li>
                </>
              )}
              {loading ? null : !isAuthenticated ? (
                <>
                  <li>
                    <Button
                      asChild
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsOpen(false)}
                    >
                      <Link href="/login">Login</Link>
                    </Button>
                  </li>
                  <li>
                    <Button
                      asChild
                      className="w-full bg-primary hover:bg-primary/90"
                      onClick={() => setIsOpen(false)}
                    >
                      <Link href="/register">Sign Up</Link>
                    </Button>
                  </li>
                </>
              ) : (
                <li>
                  <Button
                    variant="outline"
                    className="w-full text-red-600 hover:text-red-600"
                    onClick={handleLogout}
                  >
                    Logout
                  </Button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
