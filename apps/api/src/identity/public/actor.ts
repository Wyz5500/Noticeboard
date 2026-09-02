/** Defines the stable, framework-free identity value shared with other Features. */

export interface Actor {
  id: string;
  name: string;
  role: string;
  roleLabel?: string;
  permissions?: string[];
}
