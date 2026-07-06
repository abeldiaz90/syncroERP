"use client";
import { useState } from 'react';
import { Printer, FileSpreadsheet, Download, Loader2 } from 'lucide-react';

interface IColumna {
  key:    string;   // propiedad del objeto
  label:  string;   // encabezado en Excel
  fmt?:   (v: any) => string; // formato opcional
}

interface IExportBarProps {
  titulo:   string;             // nombre del archivo y encabezado
  datos:    any[];              // array de objetos a exportar
  columnas: IColumna[];         // definición de columnas
  subtitulo?: string;           // ej: "Período: junio 2026"
}

export function ExportBar({ titulo, datos, columnas, subtitulo }: IExportBarProps) {
  const [exportando, setExportando] = useState(false);

  // ── PDF ────────────────────────────────────────────────────────
  const exportarPDF = () => window.print();

  // ── Excel con SheetJS ──────────────────────────────────────────
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const XLSX = await import('xlsx');

      // Encabezado del reporte
      const meta: any[][] = [
        [titulo],
        subtitulo ? [subtitulo] : [],
        [`Generado: ${new Date().toLocaleString('es-MX')}`],
        [],
        columnas.map(c => c.label),
      ].filter(r => r.length > 0);

      // Filas de datos
      const filas = datos.map(row =>
        columnas.map(c => {
          const val = c.key.split('.').reduce((o, k) => o?.[k], row);
          return c.fmt ? c.fmt(val) : (val ?? '');
        })
      );

      const wb  = XLSX.utils.book_new();
      const ws  = XLSX.utils.aoa_to_sheet([...meta, ...filas]);

      // Ancho de columnas automático
      ws['!cols'] = columnas.map((c, i) => ({
        wch: Math.max(
          c.label.length,
          ...filas.map(r => String(r[i] ?? '').length)
        ) + 2,
      }));

      // Estilo del título (fila 1)
      if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 14 } };

      XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
      XLSX.writeFile(wb, `${titulo.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('Error exportando Excel:', e);
      alert('Error al exportar. Verifica que xlsx esté instalado.');
    }
    setExportando(false);
  };

  return (
    <div className="export-bar print:hidden" style={{
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <button onClick={exportarPDF}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', background: '#fff',
          border: '0.5px solid #e2e8f0', borderRadius: 10,
          fontSize: 12, fontWeight: 600, color: '#475569',
          cursor: 'pointer',
        }}>
        <Printer style={{ width: 13, height: 13 }}/> PDF
      </button>

      <button onClick={exportarExcel} disabled={exportando || !datos.length}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', background: '#059669',
          border: 'none', borderRadius: 10,
          fontSize: 12, fontWeight: 600, color: '#fff',
          cursor: datos.length ? 'pointer' : 'not-allowed',
          opacity: datos.length ? 1 : 0.5,
        }}>
        {exportando
          ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }}/>
          : <FileSpreadsheet style={{ width: 13, height: 13 }}/>
        }
        Excel
      </button>

      {datos.length > 0 && (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {datos.length} registros
        </span>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
