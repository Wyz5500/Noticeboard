/** Defines the stable, framework-free identity value shared with other Features. */

export interface Actor {
  id: string;
  username: string;
  name: string;
  role: string;
  roleLabel?: string;
  permissions?: string[];
}
