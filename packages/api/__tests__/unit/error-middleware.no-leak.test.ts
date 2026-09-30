/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Une erreur non typée (500) ne renvoie JAMAIS son message : chemin Windows ou
 * Unix, nom de table, requête… Le détail reste dans les journaux.
 */
import { errorHandler } from '../../src/middleware/error-middleware';

const GENERIC = 'Une erreur est survenue. Veuillez réessayer plus tard.';

function call(err: any) {
  const res: any = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  errorHandler(err, { method: 'GET', path: '/x', ip: '127.0.0.1' } as any, res, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('errorHandler : pas de fuite sur un 500 non typé', () => {
  it.each([
    ['chemin Windows', "ENOENT: no such file or directory, open 'D:\\APP\\uploads\\x.pdf'"],
    ['chemin /tmp', "EACCES: permission denied, open '/tmp/abc/x.pdf'"],
    ['chemin /data', 'cannot read /data/uploads/x.pdf'],
    ['chemin /mnt', 'cannot read /mnt/volume/x.pdf'],
    ['chemin /root', 'cannot read /root/.ssh/id_rsa'],
    ['table SQL', 'relation "users" does not exist'],
    ['message anodin', 'Boum interne']
  ])('%s', (_label, message) => {
    const { status, body } = call(new Error(message));
    expect(status).toBe(500);
    expect(body.message).toBe(GENERIC);
    expect(JSON.stringify(body)).not.toContain(message);
  });

  it('une erreur portant un statut 5xx ne livre pas son message', () => {
    const err: any = new Error('ENOENT D:\\secret\\x');
    err.statusCode = 503;
    const { status, body } = call(err);
    expect(status).toBe(503);
    expect(body.message).toBe(GENERIC);
  });
});
