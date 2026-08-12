import {
  type EngineSystemContext,
  type EngineSystemRegistry,
} from "@coffeemakerstudio/roast";
import { SHAPE, type IdefaultPhysics, type IPhysics } from "./physics.js";
import type { Vector2D } from "@coffeemakerstudio/roast";

export const PHYSICS_BODY_CAPABILITY = "physics.body" as const;
export const PHYSICS_MOTION_SYSTEM_ID = "core.physics-motion" as const;

export interface PhysicsBodyComponentState {
  schemaVersion: 1;
  position: Vector2D;
  velocity: Vector2D;
  rotation: number;
  angularVelocity: number;
  enabled: boolean;
  shape: SHAPE;
  bounds: Vector2D;
  mass: number;
  bounceFactor: number;
}

export function createPhysicsBodyState(input: Omit<PhysicsBodyComponentState, "schemaVersion">): PhysicsBodyComponentState {
  const state = structuredClone({ schemaVersion: 1, ...input });
  validatePhysicsBodyState(state);
  return state;
}

export function validatePhysicsBodyState(value: unknown): asserts value is PhysicsBodyComponentState {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Physics body state must use schema version 1");
  exactKeys(value, ["schemaVersion", "position", "velocity", "rotation", "angularVelocity", "enabled", "shape", "bounds", "mass", "bounceFactor"]);
  finiteVector(value.position, "Physics body position");
  finiteVector(value.velocity, "Physics body velocity");
  finite(value.rotation, "Physics body rotation");
  finite(value.angularVelocity, "Physics body angular velocity");
  if (typeof value.enabled !== "boolean") throw new Error("Physics body enabled must be boolean");
  if (value.shape !== SHAPE.CIRCLE && value.shape !== SHAPE.LINE && value.shape !== SHAPE.RECTANGLE) throw new Error("Physics body shape is invalid");
  finiteVector(value.bounds, "Physics body bounds");
  if (value.bounds.x < 0 || value.bounds.y < 0 || value.shape === SHAPE.CIRCLE && value.bounds.x <= 0) throw new Error("Physics body bounds are invalid");
  finite(value.mass, "Physics body mass");
  if (value.mass <= 0) throw new Error("Physics body mass must be positive");
  finite(value.bounceFactor, "Physics body bounce factor");
  if (value.bounceFactor < 0 || value.bounceFactor > 1) throw new Error("Physics body bounce factor must be between 0 and 1");
}

/** A zero-copy IPhysics view over a canonical physics.body component. */
export class PhysicsBodyView implements IdefaultPhysics {
  public constructor(private readonly state: PhysicsBodyComponentState, private readonly collisionHandler: ((event: { entity: IPhysics<SHAPE> }) => void) | undefined = undefined) {
    validatePhysicsBodyState(state);
  }
  public getPos(): Vector2D { return this.state.position; }
  public setPos(value: Vector2D): void { this.state.position.x = value.x; this.state.position.y = value.y; }
  public getVel(): Vector2D { return this.state.velocity; }
  public setVel(value: Vector2D): void { this.state.velocity.x = value.x; this.state.velocity.y = value.y; }
  public setMass(value: number): void { finite(value, "Physics body mass"); if (value <= 0) throw new Error("Physics body mass must be positive"); this.state.mass = value; }
  public getMass(): number { return this.state.mass; }
  public setFriction(_value: number): void { /* Friction is strategy-owned, not body state. */ }
  public getFriction(): number | undefined { return undefined; }
  public onCollision(event: { entity: IPhysics<SHAPE> }): void { this.collisionHandler?.(event); }
  public setBounceFactor(value: number): void { finite(value, "Physics body bounce factor"); if (value < 0 || value > 1) throw new Error("Physics body bounce factor must be between 0 and 1"); this.state.bounceFactor = value; }
  public getBounceFactor(): number { return this.state.bounceFactor; }
  public getBounds(): Vector2D { return this.state.bounds; }
  public physicsEnabled(): boolean { return this.state.enabled; }
  public setPhysicsEnabled(value: boolean): void { this.state.enabled = value; }
  public getShape(): SHAPE { return this.state.shape; }
}

export function registerPhysicsMotionSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
  return registry.register({
    id: PHYSICS_MOTION_SYSTEM_ID,
    provides: [PHYSICS_MOTION_SYSTEM_ID],
    requiresCapabilities: [PHYSICS_BODY_CAPABILITY],
  }, (context: EngineSystemContext) => {
    for (const entity of context.query([PHYSICS_BODY_CAPABILITY])) {
      const body = entity.getComponent<PhysicsBodyComponentState>(PHYSICS_BODY_CAPABILITY);
      if (!body || !body.enabled) continue;
      validatePhysicsBodyState(body);
      body.position.x += body.velocity.x * context.deltaSeconds;
      body.position.y += body.velocity.y * context.deltaSeconds;
      body.rotation += body.angularVelocity * context.deltaSeconds;
    }
  });
}

function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void { if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) throw new Error("Physics body state contains invalid fields"); }
function finite(value: unknown, label: string): asserts value is number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`); }
function finiteVector(value: unknown, label: string): asserts value is Vector2D { if (!isRecord(value)) throw new Error(`${label} must be a vector`); finite(value.x, `${label} x`); finite(value.y, `${label} y`); }
