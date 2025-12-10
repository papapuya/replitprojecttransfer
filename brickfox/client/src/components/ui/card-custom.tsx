import React from "react";
import { cn } from "../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardCustom: React.FC<CardProps> = ({ className, children, ...props }) => (
  <div className={cn("bg-white rounded-2xl shadow-soft p-6", className)} {...props}>
    {children}
  </div>
);
