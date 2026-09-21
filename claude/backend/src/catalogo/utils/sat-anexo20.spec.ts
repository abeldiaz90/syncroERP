import { Workbook } from 'exceljs';
import {
  ErrorCatalogoSat,
  leerCatalogoSat,
  verificarFormato,
} from './sat-anexo20';

/**
 * El libro real del SAT pesa decenas de megas y cambia de revisión en
 * revisión. Aquí se arma uno chiquito con la misma forma: las mismas hojas,
 * los mismos encabezados y los casos que sí rompen en la vida real —renglones
 * de título antes de los encabezados, claves con ceros a la izquierda que
 * Excel devuelve como número, códigos sin colonia y colonias sin código.
 */
function libroDePrueba(opciones: { titulo?: boolean } = {}): Workbook {
  const libro = new Workbook();
  const relleno = opciones.titulo ? [['Catálogos CFDI 4.0'], []] : [];

  const estado = libro.addWorksheet('c_Estado');
  estado.addRows([
    ...relleno,
    ['c_Estado', 'c_Pais', 'Descripción'],
    ['AGU', 'MEX', 'Aguascalientes'],
    ['CMX', 'MEX', 'Ciudad de México'],
  ]);

  const municipio = libro.addWorksheet('c_Municipio');
  municipio.addRows([
    ...relleno,
    ['c_Municipio', 'c_Estado', 'Descripción'],
    ['001', 'AGU', 'Aguascalientes'],
    ['015', 'CMX', 'Cuauhtémoc'],
  ]);

  const localidad = libro.addWorksheet('c_Localidad');
  localidad.addRows([
    ...relleno,
    ['c_Localidad', 'c_Estado', 'Descripción'],
    ['01', 'AGU', 'Aguascalientes'],
  ]);

  const codigo = libro.addWorksheet('c_CodigoPostal');
  codigo.addRows([
    ...relleno,
    ['c_CodigoPostal', 'c_Estado', 'c_Municipio', 'c_Localidad'],
    ['20000', 'AGU', '001', '01'],
    ['06000', 'CMX', '015', ''],
    ['06010', 'CMX', '015', ''],
  ]);

  const colonia = libro.addWorksheet('c_Colonia');
  colonia.addRows([
    ...relleno,
    ['c_Colonia', 'c_CodigoPostal', 'Nombre del asentamiento'],
    ['0001', '20000', 'Zona Centro'],
    ['0002', '06000', 'Centro'],
    ['0003', '06000', 'Centro Histórico'],
    ['0004', '99999', 'Colonia de un código que no existe'],
  ]);

  return libro;
}

describe('leerCatalogoSat', () => {
  it('une las cinco hojas en filas con estado, municipio y ciudad resueltos', () => {
    const { filas } = leerCatalogoSat(libroDePrueba());
    const centro = filas.find(
      (f) => f.cp === '06000' && f.colonia === 'Centro Histórico',
    );

    expect(centro).toEqual({
      cp: '06000',
      estadoClave: 'CMX',
      estadoNombre: 'Ciudad de México',
      municipioClave: '015',
      municipioNombre: 'Cuauhtémoc',
      ciudad: null,
      colonia: 'Centro Histórico',
      tipoAsentamiento: null,
    });

    const aguascalientes = filas.find((f) => f.cp === '20000');
    expect(aguascalientes?.ciudad).toBe('Aguascalientes');
  });

  it('encuentra los encabezados aunque el SAT anteponga renglones de título', () => {
    const conTitulo = leerCatalogoSat(libroDePrueba({ titulo: true }));
    const sinTitulo = leerCatalogoSat(libroDePrueba());
    expect(conTitulo.filas).toEqual(sinTitulo.filas);
  });

  it('guarda el código postal sin colonia publicada con la colonia en blanco', () => {
    const { filas, codigosSinColonia } = leerCatalogoSat(libroDePrueba());
    const huerfano = filas.filter((f) => f.cp === '06010');

    expect(codigosSinColonia).toBe(1);
    expect(huerfano).toHaveLength(1);
    expect(huerfano[0].colonia).toBe('');
    // Lo que justifica guardarlo: el domicilio se sigue deduciendo.
    expect(huerfano[0].municipioNombre).toBe('Cuauhtémoc');
    expect(huerfano[0].estadoNombre).toBe('Ciudad de México');
  });

  it('descarta la colonia cuyo código postal no está en c_CodigoPostal', () => {
    const { filas, coloniasHuerfanas } = leerCatalogoSat(libroDePrueba());
    expect(coloniasHuerfanas).toBe(1);
    expect(filas.some((f) => f.cp === '99999')).toBe(false);
  });

  it('dice qué hoja falta y cuáles encontró, en lugar de leer basura', () => {
    const libro = libroDePrueba();
    libro.removeWorksheet(libro.getWorksheet('c_Colonia')!.id);

    expect(() => leerCatalogoSat(libro)).toThrow(ErrorCatalogoSat);
    expect(() => leerCatalogoSat(libro)).toThrow(/c_Colonia/);
    expect(() => leerCatalogoSat(libro)).toThrow(/c_CodigoPostal/);
  });

  it('nombra la columna que falta cuando el anexo cambia de encabezados', () => {
    const libro = libroDePrueba();
    const hoja = libro.getWorksheet('c_Colonia')!;
    hoja.getRow(1).getCell(3).value = 'Asentamiento';

    expect(() => leerCatalogoSat(libro)).toThrow(/Nombre del asentamiento/);
  });
});

describe('verificarFormato', () => {
  it('rechaza el .xls binario viejo diciendo cómo convertirlo', () => {
    const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]);
    expect(() => verificarFormato(ole2)).toThrow(/xlsx/);
  });

  it('rechaza lo que no es un libro de Excel', () => {
    expect(() => verificarFormato(Buffer.from('<html>404</html>'))).toThrow(
      ErrorCatalogoSat,
    );
  });

  it('acepta un .xlsx', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]);
    expect(() => verificarFormato(zip)).not.toThrow();
  });
});
