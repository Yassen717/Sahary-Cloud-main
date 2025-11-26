"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Menu, X, Cloud } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { UserProfileDropdown } from "./UserProfileDropdown";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
  };

  return (
    <header className={cn(
      "fixed top-0 w-full z-50 transition-all duration-300",
      isScrolled 
        ? "bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-md py-2" 
        : "bg-transparent py-4"
    )}>
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center transform rotate-12 hover:rotate-0 transition-transform duration-300">
            <Cloud size={24} className="text-white" />
          </div>
          <span className="font-bold text-xl md:text-2xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Sahary Cloud
          </span>
        </Link>
        
        <div className="hidden md:flex items-center gap-6">
          <nav>
            <ul className="flex items-center gap-6">
              <li>
                <Link href="#features" className="hover:text-primary transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#about" className="hover:text-primary transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="#plans" className="hover:text-primary transition-colors">
                  Plans
                </Link>
              </li>
              {isAuthenticated && (
                <li>
                  <Link href="/dashboard" className="hover:text-primary transition-colors">
                    Dashboard
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <ThemeToggle />
          {!mounted ? (
            // Show loading state during SSR
            <>
              <Button asChild variant="outline" className="mr-2">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild className="bg-primary hover:bg-primary/90">
                <Link href="/register">Sign Up</Link>
              </Button>
            </>
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
        
        <div className="md:hidden flex items-center gap-4">
          <ThemeToggle />
          <Button variant="outline" size="icon" onClick={toggleMenu} aria-label="Toggle menu">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white dark:bg-gray-900 shadow-lg py-4">
          <nav className="container mx-auto px-4">
            <ul className="flex flex-col gap-4">
              {isAuthenticated && user && (
                <li className="pb-2 border-b">
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </li>
              )}
              <li>
                <Link 
                  href="#features" 
                  className="block py-2 hover:text-primary transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Features
                </Link>
              </li>
              <li>
                <Link 
                  href="#about" 
                  className="block py-2 hover:text-primary transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  About
                </Link>
              </li>
              <li>
                <Link 
                  href="#plans" 
                  className="block py-2 hover:text-primary transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  Plans
                </Link>
              </li>
              {isAuthenticated && (
                <>
                  <li>
                    <Link 
                      href="/dashboard" 
                      className="block py-2 hover:text-primary transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link 
                      href="/profile" 
                      className="block py-2 hover:text-primary transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Profile
                    </Link>
                  </li>
                  <li>
                    <Link 
                      href="/settings" 
                      className="block py-2 hover:text-primary transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      Settings
                    </Link>
                  </li>
                </>
              )}
              {!isAuthenticated ? (
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