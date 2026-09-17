import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type CommonProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
};

type InputProps = CommonProps & InputHTMLAttributes<HTMLInputElement> & { as?: "input" };
type TextareaProps = CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { as: "textarea" };
export type TextFieldProps = InputProps | TextareaProps;

export const TextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(function TextField(props, ref) {
  const generatedId = useId();
  const { label, description, error, className, inputClassName, id = generatedId, as = "input", ...fieldProps } = props;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  const fieldClassName = ["ui-text-field__control", inputClassName].filter(Boolean).join(" ");
  const field = as === "textarea"
    ? <textarea {...fieldProps as TextareaProps} id={id} ref={ref as React.Ref<HTMLTextAreaElement>} aria-describedby={describedBy} aria-invalid={error ? true : props["aria-invalid"]} className={fieldClassName} />
    : <input {...fieldProps as InputProps} id={id} ref={ref as React.Ref<HTMLInputElement>} aria-describedby={describedBy} aria-invalid={error ? true : props["aria-invalid"]} className={fieldClassName} />;
  return (
    <label className={["ui-text-field", className].filter(Boolean).join(" ")}>
      {label !== undefined && <span className="ui-text-field__label">{label}</span>}
      {field}
      {description && <span id={descriptionId} className="ui-text-field__description">{description}</span>}
      {error && <span id={errorId} className="ui-text-field__error" role="alert">{error}</span>}
    </label>
  );
});
TextField.displayName = "TextField";
