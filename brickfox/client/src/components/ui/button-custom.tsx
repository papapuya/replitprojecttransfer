import React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline";
}

export const ButtonCustom: React.FC<ButtonProps> = ({ variant = "primary", className, children, ...props }) => {
  const base = "px-5 py-2.5 rounded-2xl font-medium transition-all duration-200 shadow-soft";
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    outline: "border border-primary text-primary bg-white hover:bg-primary hover:text-white"
  };

  return (
    <button className={cn(base, styles[variant], className)} {...props}>
      {children}
    </button>
  );
};
