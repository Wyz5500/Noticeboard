/** Exposes a declarative Nest integration contract while keeping the identity Guard private. */
import { UseGuards } from '@nestjs/common';

import { DemoUserGuard } from '../presentation/demo-user.guard.js';

/** Marks a controller or handler as requiring one recognized demo identity. */
export function RequireDemoIdentity(): ClassDecorator & MethodDecorator {
  return UseGuards(DemoUserGuard);
}
