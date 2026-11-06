import type { ComponentProps } from "react";

const variants = {
  primary:
    "border-ink bg-ink text-paper active:bg-[#333] disabled:border-faint disabled:bg-faint",
  secondary:
    "border-ink bg-paper text-ink active:bg-ink active:text-paper disabled:border-faint disabled:text-faint",
  danger:
    "border-error bg-error text-paper active:brightness-90 disabled:opacity-50",
  quiet:
    "border-transparent bg-transparent text-ink underline underline-offset-4 active:text-muted",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  block?: boolean;
};

/** The one button style for the app. Label it with a verb and an object: "Submit order". */
export function Button({
  variant = "secondary",
  block = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-tap items-center justify-center gap-2 border-2 px-5 font-bold select-none transition-colors duration-75 disabled:cursor-not-allowed ${block ? "w-full" : ""} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
