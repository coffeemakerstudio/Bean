import {
  movementSystemDefinition,
  type EngineMovementState,
  type EngineSystemContext,
  type EngineSystemRegistry,
  type EngineTransformState,
} from "@coffeemakerstudio/roast";

export function registerMovementSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
  return registry.register(movementSystemDefinition(), (context: EngineSystemContext) => {
    for (const entity of context.query(["transform.state", "movement.state"])) {
      const transform = entity.getComponent<EngineTransformState>("transform");
      const movement = entity.getComponent<EngineMovementState>("movement");
      if (!transform || !movement || !movement.enabled) continue;
      transform.position.x += movement.velocity.x * context.deltaSeconds;
      transform.position.y += movement.velocity.y * context.deltaSeconds;
      transform.rotation += movement.angularVelocity * context.deltaSeconds;
    }
  });
}
