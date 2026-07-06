"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  Search, User, FileText, Clock, CheckCircle2,
  XCircle, ChevronLeft, ChevronRight, RefreshCw, Download
} from 'lucide-react';

interface IResultado {
  exitosa: boolean;
  desdeCache?: boolean;
  curp?: string; nombre?: string;
  primerApellido?: string; segundoApellido?: string;
  fechaNacimiento?: string; sexo?: string;
  entidadNacimiento?: string; nacionalidad?: string;
  docProbatorio?: string; statusCurp?: string;
  anioRegistro?: string; numActa?: string;
  entidadRegistro?: string; municipioRegistro?: string;
  error?: string;
}

interface IHistorial {
  id: string; tipoConsulta: string; curp?: string;
  nombre?: string; primerApellido?: string;
  statusCurp?: string; exitosa: boolean; fechaConsulta: string;
}

interface IEntidad { clave: string; nombre: string; }

const SEXOS = [{ val: 'H', label: 'Hombre' }, { val: 'M', label: 'Mujer' }];

const fmtFecha = (s: string) => new Date(s).toLocaleString('es-MX', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

export default function CurpPage() {
  const [tab, setTab]             = useState<'consulta' | 'historial'>('consulta');
  const [modo, setModo]           = useState<'CURP' | 'DATOS'>('CURP');
  const [curp, setCurp]           = useState('');
  const [form, setForm]           = useState({ nombre: '', primerApellido: '', segundoApellido: '', fechaNacimiento: '', sexo: 'H', entidadNacimiento: '' });
  const [resultado, setResultado] = useState<IResultado | null>(null);
  const [buscando, setBuscando]   = useState(false);
  const [entidades, setEntidades] = useState<IEntidad[]>([]);
  const [historial, setHistorial] = useState<IHistorial[]>([]);
  const [pagina, setPagina]       = useState(1);
  const [totalPags, setTotalPags] = useState(1);
  const [cargandoHist, setCargandoHist] = useState(false);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    fetch(`${api}/rpa/curp/entidades`, { headers: h() })
      .then(r => r.ok ? r.json() : [])
      .then(setEntidades)
      .catch(() => {});
  }, []);

  const cargarHistorial = useCallback(async () => {
    setCargandoHist(true);
    const r = await fetch(`${api}/rpa/curp/historial?pagina=${pagina}&limite=15`, { headers: h() }).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setHistorial(d.datos ?? []);
      setTotalPags(d.totalPaginas ?? 1);
    }
    setCargandoHist(false);
  }, [pagina]);

  useEffect(() => { if (tab === 'historial') cargarHistorial(); }, [tab, cargarHistorial]);

  const consultar = async () => {
    setBuscando(true);
    setResultado(null);
    const body = modo === 'CURP'
      ? { tipo: 'CURP', curp: curp.toUpperCase().trim() }
      : { tipo: 'DATOS', ...form };

    const r = await fetch(`${api}/rpa/curp/consultar`, {
      method: 'POST', headers: h(), body: JSON.stringify(body),
    }).catch(() => null);

    if (r?.ok) setResultado(await r.json());
    else setResultado({ exitosa: false, error: 'Error de conexión con el servidor' });
    setBuscando(false);
  };

  const exportarJSON = () => {
    if (!resultado) return;
    const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `CURP_${resultado.curp ?? 'resultado'}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '28px 24px', maxWidth: '960px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#4f46e5', marginBottom: 4 }}>
          RPA — Automatización
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#eef2ff', padding: 8, borderRadius: 10 }}>
            <User style={{ width: 20, height: 20, color: '#4f46e5' }}/>
          </div>
          Consulta CURP — RENAPO
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Consulta en tiempo real al Registro Nacional de Población (RENAPO).
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content' }}>
        {[
          { key: 'consulta', label: 'Nueva consulta', icon: Search },
          { key: 'historial', label: 'Historial', icon: Clock },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? '#4f46e5' : '#64748b',
                boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition: 'all .15s',
              }}>
              <Icon style={{ width: 14, height: 14 }}/>{t.label}
            </button>
          );
        })}
      </div>

      {/* ── CONSULTA ─────────────────────────────────────────────────────── */}
      {tab === 'consulta' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Panel izquierdo: formulario */}
          <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Tipo de consulta</p>
            </div>

            <div style={{ padding: '16px 18px' }}>
              {/* Modo selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {[{ val: 'CURP', label: 'Por CURP' }, { val: 'DATOS', label: 'Por datos' }].map(m => (
                  <button key={m.val} onClick={() => { setModo(m.val as any); setResultado(null); }}
                    style={{
                      flex: 1, padding: '8px', border: '1.5px solid',
                      borderColor: modo === m.val ? '#4f46e5' : '#e2e8f0',
                      background: modo === m.val ? '#eef2ff' : '#fff',
                      color: modo === m.val ? '#4f46e5' : '#64748b',
                      borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Por CURP */}
              {modo === 'CURP' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                    CURP
                  </label>
                  <input
                    value={curp}
                    onChange={e => setCurp(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && curp.length === 18 && consultar()}
                    maxLength={18}
                    placeholder="XXXX000000XXXXXXXX00"
                    style={{
                      width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
                      borderRadius: 10, fontSize: 14, fontFamily: 'monospace',
                      letterSpacing: '2px', textTransform: 'uppercase',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {curp.length}/18 caracteres
                  </p>
                </div>
              )}

              {/* Por datos */}
              {modo === 'DATOS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { key: 'nombre',          label: 'Nombre(s)',          ph: 'JUAN CARLOS'     },
                    { key: 'primerApellido',  label: 'Primer apellido',    ph: 'GARCÍA'          },
                    { key: 'segundoApellido', label: 'Segundo apellido',   ph: 'LÓPEZ'           },
                    { key: 'fechaNacimiento', label: 'Fecha nacimiento (DD/MM/YYYY)', ph: '28/08/1984', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: 4 }}>{f.label}</label>
                      <input
                        value={(form as any)[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value.toUpperCase() }))}
                        placeholder={f.ph}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Sexo</label>
                      <select value={form.sexo} onChange={e => setForm(p => ({ ...p, sexo: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                        {SEXOS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Estado de nacimiento</label>
                      <select value={form.entidadNacimiento} onChange={e => setForm(p => ({ ...p, entidadNacimiento: e.target.value }))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                        <option value="">-- Seleccionar --</option>
                        {entidades.map(e => <option key={e.clave} value={e.clave}>{e.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón consultar */}
              <button onClick={consultar} disabled={buscando || (modo === 'CURP' ? curp.length !== 18 : !form.nombre)}
                style={{
                  marginTop: 16, width: '100%', padding: '11px',
                  background: '#4f46e5', color: '#fff', border: 'none',
                  borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: (modo === 'CURP' ? curp.length !== 18 : !form.nombre) ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {buscando
                  ? <><div style={{ width: 16, height: 16, border: '2px solid #fff3', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}/> Consultando RENAPO...</>
                  : <><Search style={{ width: 15, height: 15 }}/> Consultar</>
                }
              </button>
            </div>
          </div>

          {/* Panel derecho: resultado */}
          <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Resultado</p>
              {resultado?.exitosa && (
                <button onClick={exportarJSON}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 7, fontSize: 11, cursor: 'pointer', color: '#475569' }}>
                  <Download style={{ width: 11, height: 11 }}/> JSON
                </button>
              )}
            </div>

            <div style={{ padding: '18px' }}>
              {!resultado && !buscando && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <User style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: .3 }}/>
                  <p style={{ fontSize: 13 }}>Ingresa una CURP o datos personales para consultar</p>
                </div>
              )}

              {buscando && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }}/>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Consultando RENAPO...</p>
                </div>
              )}

              {resultado && !buscando && (
                resultado.exitosa ? (
                  <div>
                    {/* Banner éxito */}
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: '#059669' }}/>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46' }}>
                        CURP encontrada en RENAPO
                        {resultado.desdeCache && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, color: '#059669' }}>(desde caché)</span>}
                      </span>
                    </div>

                    {/* CURP destacada */}
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 14, textAlign: 'center', border: '0.5px solid #e2e8f0' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>CURP</p>
                      <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '2px', color: '#0f172a' }}>
                        {resultado.curp}
                      </p>
                    </div>

                    {/* Tarjeta 1: Datos personales */}
                    <div style={{ border: '0.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ background: '#0f172a', padding: '7px 14px' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>Datos del solicitante</p>
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        {[
                          { label: 'Nombre(s)',            val: resultado.nombre },
                          { label: 'Primer apellido',      val: resultado.primerApellido },
                          { label: 'Segundo apellido',     val: resultado.segundoApellido },
                          { label: 'Sexo',                 val: resultado.sexo },
                          { label: 'Fecha de nacimiento',  val: resultado.fechaNacimiento },
                          { label: 'Nacionalidad',         val: resultado.nacionalidad },
                          { label: 'Entidad de nacimiento',val: resultado.entidadNacimiento },
                          { label: 'Documento probatorio', val: resultado.docProbatorio },
                          { label: 'Status CURP',          val: resultado.statusCurp },
                        ].filter(r => r.val).map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '0.5px solid #f8fafc' }}>
                            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{r.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tarjeta 2: Datos del acta */}
                    {(resultado.anioRegistro || resultado.numActa || resultado.entidadRegistro || resultado.municipioRegistro) && (
                      <div style={{ border: '0.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ background: '#0f172a', padding: '7px 14px' }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>Datos del documento probatorio</p>
                        </div>
                        <div style={{ padding: '4px 0' }}>
                          {[
                            { label: 'Año de registro',       val: resultado.anioRegistro },
                            { label: 'Número de acta',        val: resultado.numActa },
                            { label: 'Entidad de registro',   val: resultado.entidadRegistro },
                            { label: 'Municipio de registro', val: resultado.municipioRegistro },
                          ].filter(r => r.val).map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '0.5px solid #f8fafc' }}>
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{r.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>{r.val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ background: '#fff1f2', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <XCircle style={{ width: 24, height: 24, color: '#e11d48' }}/>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No encontrado</p>
                    <p style={{ fontSize: 13, color: '#64748b' }}>{resultado.error ?? 'La CURP no existe en el registro de RENAPO'}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORIAL ────────────────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: '#0f172a', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>Historial de consultas</p>
            <button onClick={cargarHistorial} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <RefreshCw style={{ width: 14, height: 14, animation: cargandoHist ? 'spin 1s linear infinite' : 'none' }}/>
            </button>
          </div>

          {cargandoHist ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}/>
            </div>
          ) : historial.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              <FileText style={{ width: 32, height: 32, margin: '0 auto 10px', opacity: .3 }}/>
              Sin consultas registradas
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Fecha</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>CURP</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Nombre</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(h => (
                    <tr key={h.id} style={{ borderBottom: '0.5px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', fontSize: 12 }}>{fmtFecha(h.fechaConsulta)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: h.tipoConsulta === 'CURP' ? '#eef2ff' : '#f0fdfa', color: h.tipoConsulta === 'CURP' ? '#4f46e5' : '#0d9488' }}>
                          {h.tipoConsulta}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#0f172a' }}>{h.curp ?? '—'}</td>
                      <td style={{ padding: '10px 16px', color: '#475569', fontSize: 12 }}>
                        {[h.nombre, h.primerApellido].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {h.exitosa
                          ? <CheckCircle2 style={{ width: 16, height: 16, color: '#059669', margin: '0 auto' }}/>
                          : <XCircle style={{ width: 16, height: 16, color: '#e11d48', margin: '0 auto' }}/>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Paginación */}
              {totalPags > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '0.5px solid #f1f5f9' }}>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>Página {pagina} de {totalPags}</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={pagina === 1}
                      style={{ padding: '5px', border: '0.5px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', opacity: pagina === 1 ? .4 : 1 }}>
                      <ChevronLeft style={{ width: 14, height: 14 }}/>
                    </button>
                    <button onClick={() => setPagina(p => Math.min(totalPags, p+1))} disabled={pagina === totalPags}
                      style={{ padding: '5px', border: '0.5px solid #e2e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', opacity: pagina === totalPags ? .4 : 1 }}>
                      <ChevronRight style={{ width: 14, height: 14 }}/>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
