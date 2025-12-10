import React from "react";
import { cn } from "@/lib/utils";

interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export const Section: React.FC<SectionProps> = ({ title, children, className, ...props }) => (
  <section className={cn("py-10 px-4 md:px-10", className)} {...props}>
    {title && <h2 className="text-2xl font-bold mb-6">{title}</h2>}
    <div>{children}</div>
  </section>
);
