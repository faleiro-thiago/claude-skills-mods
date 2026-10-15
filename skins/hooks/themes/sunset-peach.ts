import type { Skin } from '../skin'

const skin: Skin = {
  name: 'sunset-peach',
  label: 'Sunset Peach',
  palette: {
    read: '#f2b385',
    write: '#f7607e',
    run: '#fdc86a',
    search: '#e89bb0',
    web: '#ffa07a',
    mcp: '#f5d6a8',
    other: '#d8b8a8',
    user: '#f77f55',
    fg: '#f5e6dc',
    muted: '#b8988c',
    surface: '#3a2a2a',
    zebra: '#2e2222',
    ok: '#a8c97f',
    err: '#f7607e',
    warn: '#fdc86a',
  },
  spinner: [
    'Pensando',
    'Analisando',
    'Processando',
    'Lendo',
    'Verificando',
    'Planejando',
    'Escrevendo',
    'Revisando',
    'Calculando',
    'Organizando',
  ],
  done: ['Concluído', 'Feito', 'Pronto', 'Finalizado'],
}

export default skin
