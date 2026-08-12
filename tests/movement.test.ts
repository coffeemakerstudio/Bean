import { expect, test } from "bun:test";
import { engine } from "@coffeemakerstudio/roast";
import { registerMovementSystem } from "../src/index.ts";

test("Bean movement executes through the Roast runtime", () => {
  const registry = engine.createSystemRegistry();
  registerMovementSystem(registry);
  const transform = engine.createTransformState({ position: { x: 1, y: 2 } });
  const movement = engine.createMovementState({ velocity: { x: 3, y: -4 } });
  const runtime = engine.createWorld({ id: "movement-test", worldSize: { x: 100, y: 100 } })
    .addEntity(engine.createEntity({ id: "mover", capabilities: ["transform.state", "movement.state"], transform, movement }))
    .useFramework(registry.select(["core.movement"]))
    .buildRuntime(registry);

  runtime.tick(2);
  const result = runtime.getEntity("mover")?.getComponent<typeof transform>("transform");
  expect(result?.position).toEqual({ x: 7, y: -6 });
});

test("Bean movement ignores entities without both capability states", () => {
  const registry = engine.createSystemRegistry();
  registerMovementSystem(registry);
  const transform = engine.createTransformState({ position: { x: 1, y: 2 } });
  const runtime = engine.createWorld({ id: "movement-test", worldSize: { x: 100, y: 100 } })
    .addEntity(engine.createEntity({ id: "not-a-mover", capabilities: ["transform.state"], transform }))
    .useFramework(registry.select(["core.movement"]))
    .buildRuntime(registry);

  runtime.tick(2);
  expect(transform.position).toEqual({ x: 1, y: 2 });
});
