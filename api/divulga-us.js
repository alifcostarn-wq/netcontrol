// Mesmo proxy do DivulgaCandContas, rodando em outra região (EUA), usado quando o de São Paulo é recusado pelo TSE.
import handler from './divulga.js';
export const config = { regions: ['iad1'] };
export default handler;
