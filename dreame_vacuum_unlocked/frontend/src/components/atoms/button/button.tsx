import styles from "./button.module.css";

type Variant = "primary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: React.ReactNode;
}

export default function Button({ variant = "ghost", children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn}${variant !== "ghost" ? ` ${styles[variant]}` : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}