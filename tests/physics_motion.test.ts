import { expect, test } from "bun:test";
import { engine, EngineRuntime } from "@coffeemakerstudio/roast";
import { createPhysicsBodyState, PHYSICS_BODY_CAPABILITY, PhysicsBodyView, registerPhysicsMotionSystem, SHAPE } from "../src/index.ts";

test("physics-motion integrates an authoritative body exactly once", () => {
  const registry = engine.createSystemRegistry();
  registerPhysicsMotionSystem(registry);
  const body = createPhysicsBodyState({ position: { x: 0, y: 2 }, velocity: { x: 10, y: -3 }, rotation: 0, angularVelocity: 4, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 0.5 });
  const runtime = engine.createWorld({ id: "physics-test", worldSize: { x: 100, y: 100 } })
    .addEntity({ id: "body", capabilities: [PHYSICS_BODY_CAPABILITY], [PHYSICS_BODY_CAPABILITY]: body })
    .useFramework(registry.select(["core.physics-motion"]))
    .buildRuntime(registry);
  runtime.tick(1);
  const result = runtime.getEntity("body")!.getComponent<typeof body>(PHYSICS_BODY_CAPABILITY)!;
  expect(result.position).toEqual({ x: 10, y: -1 });
  expect(result.rotation).toBe(4);
});

test("disabled physics bodies do not integrate", () => {
  const registry = engine.createSystemRegistry();
  registerPhysicsMotionSystem(registry);
  const body = createPhysicsBodyState({ position: { x: 1, y: 2 }, velocity: { x: 10, y: 10 }, rotation: 0, angularVelocity: 2, enabled: false, shape: SHAPE.RECTANGLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 0 });
  const runtime = engine.createWorld({ id: "physics-test", worldSize: { x: 100, y: 100 } }).addEntity({ id: "body", capabilities: [PHYSICS_BODY_CAPABILITY], [PHYSICS_BODY_CAPABILITY]: body }).useFramework(registry.select(["core.physics-motion"])).buildRuntime(registry);
  runtime.tick(3);
  expect(runtime.getEntity("body")!.getComponent<typeof body>(PHYSICS_BODY_CAPABILITY)!.position).toEqual({ x: 1, y: 2 });
});

test("PhysicsBodyView mutates the canonical component without copying", () => {
  const body = createPhysicsBodyState({ position: { x: 0, y: 0 }, velocity: { x: 4, y: 5 }, rotation: 0, angularVelocity: 0, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 2, bounceFactor: 0.5 });
  const view = new PhysicsBodyView(body);
  view.setPos({ x: 8, y: 9 });
  view.setVel({ x: -2, y: 3 });
  expect(body.position).toEqual({ x: 8, y: 9 });
  expect(body.velocity).toEqual({ x: -2, y: 3 });
  expect(view.getPos()).toBe(body.position);
  expect(view.getVel()).toBe(body.velocity);
});

test("physics body survives snapshot restore and deterministic continuation", () => {
  const registry = engine.createSystemRegistry();
  registerPhysicsMotionSystem(registry);
  const body = createPhysicsBodyState({ position: { x: 0, y: 0 }, velocity: { x: 2, y: 1 }, rotation: 0, angularVelocity: 1, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 1 });
  const runtime = engine.createWorld({ id: "physics-test", worldSize: { x: 100, y: 100 } }).addEntity({ id: "body", capabilities: [PHYSICS_BODY_CAPABILITY], [PHYSICS_BODY_CAPABILITY]: body }).useFramework(registry.select(["core.physics-motion"])).buildRuntime(registry);
  runtime.tick(2);
  const snapshot = runtime.snapshot();
  const restored = EngineRuntime.restore(snapshot, registry);
  runtime.tick(0.5);
  restored.tick(0.5);
  expect(restored.toSettings()).toEqual(runtime.toSettings());
});

test("physics body validation rejects invalid state", () => {
  expect(() => createPhysicsBodyState({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, rotation: 0, angularVelocity: 0, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 0, y: 1 }, mass: 1, bounceFactor: 0 })).toThrow();
});
