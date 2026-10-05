export type Role = 'ADMINISTRADOR' | 'CLIENTE';

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface Session {
  readonly user: SessionUser;
  readonly role: Role;
}

export function readSession(value: unknown): Session {
  if (typeof value !== 'object' || value === null || !('user' in value) || !('role' in value)) {
    throw new Error('Respuesta de sesión inválida');
  }
  const user = value.user;
  if (typeof user !== 'object' || user === null || !('id' in user) || !('name' in user)
    || !('email' in user) || typeof user.id !== 'string' || !user.id
    || typeof user.name !== 'string' || typeof user.email !== 'string'
    || (value.role !== 'ADMINISTRADOR' && value.role !== 'CLIENTE')) {
    throw new Error('Respuesta de sesión inválida');
  }
  // Proyección explícita: nunca conservar campos adicionales recibidos del servidor.
  return { user: { id: user.id, name: user.name, email: user.email }, role: value.role };
}
