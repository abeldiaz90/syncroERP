"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  formId: string;
  labels?: Record<string, string>;
}

const ERROR_CLASS = "syncro-field-error";
const INVALID_CLASSES = ["border-rose-400", "focus:border-rose-500", "focus:ring-rose-100"];

function fieldLabel(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, labels: Record<string, string>): string {
  const key = field.name || field.id;
  if (labels[key]) return labels[key];
  const label = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent : undefined;
  const placeholder = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
    ? field.placeholder
    : field instanceof HTMLSelectElement
      ? field.options[0]?.text
      : '';
  return (label || field.getAttribute("aria-label") || placeholder || key || "Campo").replace(/\s*\*\s*$/, "").trim();
}

function validationMessage(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, label: string): string {
  const value = field.value.trim();
  if (field.required && !value) return `${label} es obligatorio.`;
  if (field instanceof HTMLInputElement) {
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${label} no tiene un formato válido.`;
    if (field.minLength > 0 && value.length < field.minLength) return `${label} debe tener al menos ${field.minLength} caracteres.`;
    if (field.maxLength > 0 && value.length > field.maxLength) return `${label} no puede exceder ${field.maxLength} caracteres.`;
    if (field.pattern && value && !new RegExp(`^(?:${field.pattern})$`).test(value)) return `${label} no tiene un formato válido.`;
    if (field.type === "number" && value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return `${label} debe ser un número válido.`;
      if (field.min !== "" && number < Number(field.min)) return `${label} debe ser mayor o igual a ${field.min}.`;
      if (field.max !== "" && number > Number(field.max)) return `${label} debe ser menor o igual a ${field.max}.`;
    }
  }
  return "";
}

function removeFieldError(field: Element) {
  field.classList.remove(...INVALID_CLASSES);
  field.removeAttribute("aria-invalid");
  const container = field.closest("[data-field-container]") || field.parentElement;
  container?.querySelectorAll(`.${ERROR_CLASS}`).forEach((node) => node.remove());
}

function showFieldError(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, message: string) {
  removeFieldError(field);
  field.classList.add(...INVALID_CLASSES);
  field.setAttribute("aria-invalid", "true");
  const error = document.createElement("p");
  error.className = `${ERROR_CLASS} mt-1.5 text-xs font-medium text-rose-600 flex items-center gap-1`;
  error.textContent = message;
  const container = field.closest("[data-field-container]") || field.parentElement;
  container?.appendChild(error);
}

export default function FormValidationGuard({ formId, labels = {} }: Props) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    form.noValidate = true;

    const fields = () => Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"))
      .filter((field) => !field.disabled && field.type !== "hidden" && field.type !== "submit" && field.type !== "button");

    const clearSummary = () => form.querySelector("[data-validation-summary]")?.remove();

    const validateField = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
      const message = validationMessage(field, fieldLabel(field, labels));
      if (message) showFieldError(field, message); else removeFieldError(field);
      return message;
    };

    const onInput = (event: Event) => {
      const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (field.matches("input, select, textarea") && field.getAttribute("aria-invalid") === "true") validateField(field);
    };

    const onBlur = (event: Event) => {
      const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (field.matches("input, select, textarea") && (field.required || field.value.trim())) validateField(field);
    };

    const onSubmit = (event: SubmitEvent) => {
      clearSummary();
      const errors = fields().map((field) => ({ field, message: validateField(field) })).filter((item) => item.message);
      if (!errors.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const summary = document.createElement("div");
      summary.setAttribute("data-validation-summary", "true");
      summary.className = "mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800";
      summary.innerHTML = `<div class="flex items-start gap-2"><strong>Revisa los campos marcados.</strong></div><ul class="mt-2 list-disc pl-5 space-y-1">${errors.map(({ message }) => `<li>${message}</li>`).join("")}</ul>`;
      form.prepend(summary);

      errors[0].field.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => errors[0].field.focus(), 150);
    };

    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("focusout", onBlur);
    form.addEventListener("submit", onSubmit, true);
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("focusout", onBlur);
      form.removeEventListener("submit", onSubmit, true);
    };
  }, [formId, labels]);

  return <span className="sr-only"><AlertCircle aria-hidden="true" />Validación profesional activa</span>;
}
