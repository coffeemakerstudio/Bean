import { expect, test } from "bun:test";
import { createDefaultPhysicsStrategy, DefaultPhysicsStrategy, PhysicsBodyView, SHAPE, createPhysicsBodyState } from "../src/index.ts";

test("default strategy applies friction directly to the authoritative body", () => {
  const state = createPhysicsBodyState({ position: { x: 0, y: 0 }, velocity: { x: 10, y: 0 }, rotation: 0, angularVelocity: 0, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 0.5 });
  const view = new PhysicsBodyView(state);
  createDefaultPhysicsStrategy({ friction: 0.5, linearDrag: 0, stopThreshold: 0 }).applyFriction(view, 2);
  expect(state.velocity.x).toBeCloseTo(2.5);
  expect(view.getVel()).toBe(state.velocity);
});

test("default strategy detects and resolves circle collision on canonical bodies", () => {
  const a = createPhysicsBodyState({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 }, rotation: 0, angularVelocity: 0, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 1 });
  const b = createPhysicsBodyState({ position: { x: 1.5, y: 0 }, velocity: { x: -1, y: 0 }, rotation: 0, angularVelocity: 0, enabled: true, shape: SHAPE.CIRCLE, bounds: { x: 1, y: 1 }, mass: 1, bounceFactor: 1 });
  const av = new PhysicsBodyView(a), bv = new PhysicsBodyView(b), strategy = new DefaultPhysicsStrategy();
  expect(strategy.checkCollision(av, bv)).toBe(true);
  strategy.handleCollision(av, bv);
  expect(a.position.x).toBeLessThan(0);
  expect(b.position.x).toBeGreaterThan(1.5);
  expect(a.velocity.x).toBeLessThan(0);
  expect(b.velocity.x).toBeGreaterThan(0);
});

test("default strategy handles static bodies and serializable settings", () => {
  const strategy = new DefaultPhysicsStrategy({ friction: .9, linearDrag: .2, stopThreshold: .01 });
  expect(strategy.toSettings()).toEqual({ friction: .9, linearDrag: .2, stopThreshold: .01 });
  expect(strategy.isStatic({ getEntities: () => [{ isDead: () => false, physicsEnabled: () => true, getVel: () => ({ x: 0, y: 0 }) }] })).toBe(true);
});
