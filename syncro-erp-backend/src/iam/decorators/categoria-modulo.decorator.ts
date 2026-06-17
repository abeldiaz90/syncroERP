import { SetMetadata } from '@nestjs/common';

export const CATEGORIA_MODULO_KEY = 'categoria_modulo';
export const CategoriaModulo = (categoria: string) => SetMetadata(CATEGORIA_MODULO_KEY, categoria);