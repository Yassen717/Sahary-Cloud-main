import Link from "next/link";
import type { ReactNode } from "react";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalPageProps {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export function LegalPage({ title, description, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        <aside className="hidden lg:block">
          <nav aria-label={`${title} sections`} className="sticky top-28">
            <p className="text-sm font-semibold mb-3">On this page</p>
            <ul className="space-y-2 text-sm">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article>
          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{title}</h1>
            <p className="text-muted-foreground mb-2">{description}</p>
            <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
          </header>

          <div className="space-y-10">
            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2 className="text-xl font-semibold mb-3">
                  {index + 1}. {section.title}
                </h2>
                <div className="space-y-3 text-gray-700 dark:text-gray-300 leading-relaxed">
                  {section.content}
                </div>
              </section>
            ))}
          </div>

          <footer className="mt-12 pt-6 border-t text-sm text-muted-foreground">
            Questions about this document?{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Contact us
            </Link>
            .
          </footer>
        </article>
      </div>
    </div>
  );
}
