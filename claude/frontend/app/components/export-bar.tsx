"use client";
import { useState } from "react";
import { mensajeElegante } from "@/components/ui/dialogos";
import { Printer, FileSpreadsheet, Loader2 } from "lucide-react";

interface IColumna {
  key: string; // propiedad del objeto
  label: string; // encabezado en Excel
  fmt?: (v: any) => string; // formato opcional
}

interface IExportBarProps {
  titulo: string; // nombre del archivo y encabezado
  datos: any[]; // array de objetos a exportar
  columnas: IColumna[]; // definición de columnas
  subtitulo?: string; // ej: "Período: junio 2026"
}

export function ExportBar({
  titulo,
  datos,
  columnas,
  subtitulo,
}: IExportBarProps) {
  const [exportando, setExportando] = useState(false);

  // ── PDF ────────────────────────────────────────────────────────
  const exportarPDF = () => window.print();

  // ── Excel sin dependencias vulnerables ─────────────────────────
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const meta: unknown[][] = [
        [titulo],
        subtitulo ? [subtitulo] : [],
        [`Generado: ${new Date().toLocaleString("es-MX")}`],
        [],
        columnas.map((c) => c.label),
      ].filter((r) => r.length > 0);

      // Filas de datos
      const filas = datos.map((row) =>
        columnas.map((c) => {
          const val = c.key.split(".").reduce((o, k) => o?.[k], row);
          return c.fmt ? c.fmt(val) : (val ?? "");
        }),
      );

      const protegerFormula = (valor: unknown) => {
        const texto = String(valor ?? "");
        return /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
      };
      const xml = (valor: unknown) =>
        protegerFormula(valor)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      const filasXml = [...meta, ...filas]
        .map(
          (fila, indice) =>
            `<Row>${fila
              .map(
                (valor) =>
                  `<Cell${indice === 0 ? ' ss:StyleID="Titulo"' : ""}><Data ss:Type="String">${xml(valor)}</Data></Cell>`,
              )
              .join("")}</Row>`,
        )
        .join("");
      const nombreHoja =
        titulo.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Reporte";
      const libro = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
        <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
          <Styles><Style ss:ID="Titulo"><Font ss:Bold="1" ss:Size="14"/></Style></Styles>
          <Worksheet ss:Name="${xml(nombreHoja)}"><Table>${filasXml}</Table></Worksheet>
        </Workbook>`;
      const url = URL.createObjectURL(
        new Blob([libro], { type: "application/vnd.ms-excel;charset=utf-8" }),
      );
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `${titulo.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xls`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error exportando Excel:", e);
      await mensajeElegante(
        "No fue posible construir el archivo de Excel.",
        "No se pudo exportar",
      );
    }
    setExportando(false);
  };

  return (
    <div
      className="export-bar print:hidden"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        onClick={exportarPDF}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          background: "#fff",
          border: "0.5px solid #e2e8f0",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          color: "#475569",
          cursor: "pointer",
        }}
      >
        <Printer style={{ width: 13, height: 13 }} /> PDF
      </button>

      <button
        onClick={exportarExcel}
        disabled={exportando || !datos.length}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          background: "#059669",
          border: "none",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          color: "#fff",
          cursor: datos.length ? "pointer" : "not-allowed",
          opacity: datos.length ? 1 : 0.5,
        }}
      >
        {exportando ? (
          <Loader2
            style={{
              width: 13,
              height: 13,
              animation: "spin 1s linear infinite",
            }}
          />
        ) : (
          <FileSpreadsheet style={{ width: 13, height: 13 }} />
        )}
        Excel
      </button>

      {datos.length > 0 && (
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {datos.length} registros
        </span>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
