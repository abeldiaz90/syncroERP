/* ¿Dónde viven las 1,308 cadenas sueltas? Sin esto, envolverlas es adivinar. */
import ts from 'typescript';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS = /\b(de|la|el|los|las|que|para|con|sin|por|una|un|del|al|se|no|su|más|este|esta|cuando|todo|toda|cada|ya|si|lo|le|es|son|hay|tu|tus|y|o|pero|como|desde|hasta|sobre|aún|todavía)\b/i;
const esEspanol = (s) => { const t=s.trim(); if(t.length<3||!/[a-zA-Z]/.test(t))return false;
  if(/[{}]/.test(t))return false; if(/^[a-z-]+$/.test(t)&&!t.includes(' '))return false;
  if(/^https?:|^\/|^@\/|^#/.test(t))return false; if(/^[A-Z0-9_]+$/.test(t))return false;
  return ACENTOS.test(t)||PALABRAS.test(t); };
function archivos(dir,out=[]){for(const n of readdirSync(dir)){if(n==='node_modules'||n==='.next'||n==='traducciones')continue;
  const p=join(dir,n); if(statSync(p).isDirectory())archivos(p,out); else if(/\.tsx$/.test(n)&&!/\.spec\./.test(n))out.push(p);} return out;}
const sitios = new Map();
for (const raiz of process.argv[2].split(',')) for (const a of archivos(raiz)) {
  const src=readFileSync(a,'utf8'); if(!/^\s*['"]use client['"]/m.test(src)) continue;
  const f=ts.createSourceFile(a,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const dentroDeT=(n)=>{let p=n.parent;while(p){if(ts.isCallExpression(p)&&ts.isIdentifier(p.expression)&&p.expression.text==='t')return true;p=p.parent;}return false;};
  const enJsx=(n)=>{let p=n.parent;while(p){if(ts.isJsxExpression(p)||ts.isJsxAttribute(p))return true;p=p.parent;}return false;};
  const visita=(n)=>{
    if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&esEspanol(n.text)&&!dentroDeT(n)&&!enJsx(n)){
      const p=n.parent; let clave='(otro)';
      if(ts.isCallExpression(p)&&p.arguments.includes(n)){
        const e=p.expression;
        clave='llamada: '+(ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?`${e.expression.getText(f).slice(0,14)}.${e.name.text}`:'(expr)');
      } else if(ts.isPropertyAssignment(p)) clave='propiedad: '+p.name.getText(f);
      else if(ts.isNewExpression(p)) clave='new '+p.expression.getText(f);
      else if(ts.isVariableDeclaration(p)) clave='const';
      else if(ts.isArrayLiteralExpression(p)) clave='arreglo';
      else if(ts.isConditionalExpression(p)) clave='ternario';
      else if(ts.isBinaryExpression(p)) clave='binario '+p.operatorToken.getText(f);
      else if(ts.isReturnStatement(p)) clave='return';
      else clave='('+ts.SyntaxKind[p.kind]+')';
      const v=sitios.get(clave)??{n:0,ej:[]}; v.n++; if(v.ej.length<2)v.ej.push(n.text.trim().slice(0,46)); sitios.set(clave,v);
    }
    ts.forEachChild(n,visita);
  };
  visita(f);
}
for (const [k,v] of [...sitios].sort((a,b)=>b[1].n-a[1].n).slice(0,30)) console.log(String(v.n).padStart(5), k, '|', v.ej.join(' // '));
console.log('TOTAL', [...sitios.values()].reduce((s,v)=>s+v.n,0));
