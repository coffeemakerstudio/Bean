import { expect, test } from "bun:test";
import { SHAPE, isFiniteVector, isPhysicsParticipant, validatePhysicsBody } from "@coffeemakerstudio/bean";
test("Bean exposes generic physics validity and participation contracts", () => {
  expect(isFiniteVector({ x: 1, y: -2 })).toBe(true);
  expect(isFiniteVector({ x: Infinity, y: 0 })).toBe(false);
  expect(isPhysicsParticipant({ isDead: () => false, physicsEnabled: () => true })).toBe(true);
  expect(isPhysicsParticipant({ isDead: () => true, physicsEnabled: () => true })).toBe(false);
  expect(() => validatePhysicsBody({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, bounds: { x: 5, y: 5 }, mass: 1, bounceFactor: 0.5, shape: SHAPE.CIRCLE })).not.toThrow();
  expect(() => validatePhysicsBody({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, bounds: { x: 0, y: 5 }, mass: 1, bounceFactor: 0.5, shape: SHAPE.CIRCLE })).toThrow();
});
