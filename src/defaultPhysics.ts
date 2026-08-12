import {
  MAX_COLLISION_IMPULSE,
  PHYSICS_CONTACT_PERCENT,
  PHYSICS_CONTACT_SLOP,
  SHAPE,
  type IPhysics,
  type PhysicsEntityCollection,
  type PhysicsSettings,
  type PhysicsStrategy,
} from "./physics.js";
import type { Vector2D } from "@coffeemakerstudio/roast";

export interface DefaultPhysicsStrategyOptions extends Partial<PhysicsSettings> {}

/** Deterministic, geometry-only default strategy for Bean physics bodies. */
export class DefaultPhysicsStrategy implements PhysicsStrategy {
  public readonly friction: number;
  public readonly linearDrag: number;
  public readonly stopThreshold: number;

  public constructor(options: DefaultPhysicsStrategyOptions = {}) {
    this.friction = options.friction ?? 0.995;
    this.linearDrag = options.linearDrag ?? 0.01;
    this.stopThreshold = options.stopThreshold ?? 0.1;
    if (![this.friction, this.linearDrag, this.stopThreshold].every(Number.isFinite) || this.friction < 0 || this.linearDrag < 0 || this.stopThreshold < 0) {
      throw new Error("Physics settings must be finite and non-negative");
    }
  }

  public calculateBounce(velocity: Vector2D, normal: Vector2D): Vector2D {
    const n = this.normalize(normal);
    return this.sub(velocity, this.mult(n, 2 * this.dot(velocity, normal)));
  }
  public add(a: Vector2D, b: Vector2D): Vector2D { return { x: a.x + b.x, y: a.y + b.y }; }
  public sub(a: Vector2D, b: Vector2D): Vector2D { return { x: a.x - b.x, y: a.y - b.y }; }
  public mult(a: Vector2D, scalar: number): Vector2D { return { x: a.x * scalar, y: a.y * scalar }; }
  public dot(a: Vector2D, b: Vector2D): number { return a.x * b.x + a.y * b.y; }
  public magSq(v: Vector2D): number { return v.x * v.x + v.y * v.y; }
  public mag(v: Vector2D): number { return Math.sqrt(this.magSq(v)); }
  public normalize(v: Vector2D): Vector2D { const length = this.mag(v); return length === 0 ? { x: 0, y: 0 } : this.mult(v, 1 / length); }
  public dist(a: Vector2D, b: Vector2D): number { return this.mag(this.sub(a, b)); }
  public distSq(a: Vector2D, b: Vector2D): number { return this.magSq(this.sub(a, b)); }
  public clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

  public checkCollision(a: IPhysics<any>, b: IPhysics<any>): boolean {
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.CIRCLE) return this.checkCollisionCircles(a, b);
    if (a.getShape() === SHAPE.RECTANGLE && b.getShape() === SHAPE.RECTANGLE) return this.checkCollisionRects(a, b);
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.RECTANGLE) return this.checkCollisionCircleRect(a, b);
    if (a.getShape() === SHAPE.RECTANGLE && b.getShape() === SHAPE.CIRCLE) return this.checkCollisionCircleRect(b, a);
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.LINE) return this.checkCollisionCircleLine(a, b);
    if (a.getShape() === SHAPE.LINE && b.getShape() === SHAPE.CIRCLE) return this.checkCollisionCircleLine(b, a);
    return false;
  }
  public checkCollisionCircles(a: IPhysics<SHAPE.CIRCLE>, b: IPhysics<SHAPE.CIRCLE>): boolean { return this.distSq(a.getPos(), b.getPos()) <= (a.getBounds().x + b.getBounds().x) ** 2; }
  public checkCollisionRects(a: IPhysics<SHAPE.RECTANGLE>, b: IPhysics<SHAPE.RECTANGLE>): boolean {
    const ap = a.getPos(), bp = b.getPos(), ab = a.getBounds(), bb = b.getBounds();
    return ap.x <= bp.x + bb.x && ap.x + ab.x >= bp.x && ap.y <= bp.y + bb.y && ap.y + ab.y >= bp.y;
  }
  public checkCollisionCircleRect(circle: IPhysics<SHAPE.CIRCLE>, rectangle: IPhysics<SHAPE.RECTANGLE>): boolean {
    const cp = circle.getPos(), rp = rectangle.getPos(), rb = rectangle.getBounds();
    const closest = { x: this.clamp(cp.x, rp.x, rp.x + rb.x), y: this.clamp(cp.y, rp.y, rp.y + rb.y) };
    return this.distSq(cp, closest) <= circle.getBounds().x ** 2;
  }
  public checkCollisionCircleLine(circle: IPhysics<SHAPE.CIRCLE>, line: IPhysics<SHAPE.LINE>): boolean {
    return this.distSq(circle.getPos(), this.closestPointOnLine(circle, line)) <= circle.getBounds().x ** 2;
  }

  public handleCollision(a: IPhysics<any>, b: IPhysics<any>): void {
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.CIRCLE) { this.resolveCircles(a, b); return; }
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.RECTANGLE) { this.resolveCircleRect(a, b); return; }
    if (a.getShape() === SHAPE.RECTANGLE && b.getShape() === SHAPE.CIRCLE) { this.resolveCircleRect(b, a); return; }
    if (a.getShape() === SHAPE.CIRCLE && b.getShape() === SHAPE.LINE) { this.resolveCircleLine(a, b); return; }
    if (a.getShape() === SHAPE.LINE && b.getShape() === SHAPE.CIRCLE) { this.resolveCircleLine(b, a); }
  }

  private resolveCircles(a: IPhysics<SHAPE.CIRCLE>, b: IPhysics<SHAPE.CIRCLE>): void {
    const pa = a.getPos(), pb = b.getPos(), radius = a.getBounds().x + b.getBounds().x;
    const distance = this.dist(pa, pb);
    const nx = distance === 0 ? 1 : (pb.x - pa.x) / distance;
    const ny = distance === 0 ? 0 : (pb.y - pa.y) / distance;
    const overlap = radius - distance;
    if (overlap <= 0) return;
    const invA = 1 / a.getMass(), invB = 1 / b.getMass(), total = invA + invB;
    if (total > 0) {
      const move = Math.max(overlap - PHYSICS_CONTACT_SLOP, 0) * PHYSICS_CONTACT_PERCENT / total;
      a.setPos({ x: pa.x - nx * move * invA, y: pa.y - ny * move * invA });
      b.setPos({ x: pb.x + nx * move * invB, y: pb.y + ny * move * invB });
      const va = a.getVel(), vb = b.getVel();
      const relative = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
      if (relative < 0) {
        const impulse = (-(1 + Math.min(a.getBounceFactor(), b.getBounceFactor())) * relative) / total;
        a.setVel({ x: va.x - impulse * nx * invA, y: va.y - impulse * ny * invA });
        b.setVel({ x: vb.x + impulse * nx * invB, y: vb.y + impulse * ny * invB });
      }
    }
    a.onCollision({ entity: b }); b.onCollision({ entity: a });
  }

  private resolveCircleRect(circle: IPhysics<SHAPE.CIRCLE>, rectangle: IPhysics<SHAPE.RECTANGLE>): void {
    const cp = circle.getPos(), rp = rectangle.getPos(), rb = rectangle.getBounds(), radius = circle.getBounds().x;
    const closest = { x: this.clamp(cp.x, rp.x, rp.x + rb.x), y: this.clamp(cp.y, rp.y, rp.y + rb.y) };
    let dx = cp.x - closest.x, dy = cp.y - closest.y, distance = Math.hypot(dx, dy);
    if (distance >= radius) return;
    let nx: number, ny: number, overlap: number;
    if (distance > 0) { nx = dx / distance; ny = dy / distance; overlap = radius - distance; }
    else {
      const left = cp.x - rp.x, right = rp.x + rb.x - cp.x, top = cp.y - rp.y, bottom = rp.y + rb.y - cp.y;
      if (left <= right && left <= top && left <= bottom) { nx = -1; ny = 0; overlap = left + radius; }
      else if (right <= top && right <= bottom) { nx = 1; ny = 0; overlap = right + radius; }
      else if (top <= bottom) { nx = 0; ny = -1; overlap = top + radius; }
      else { nx = 0; ny = 1; overlap = bottom + radius; }
    }
    const invA = 1 / circle.getMass(), invB = 1 / rectangle.getMass(), total = invA + invB;
    if (total > 0) {
      const move = (overlap + 0.01);
      circle.setPos({ x: cp.x + nx * move * (invA / total), y: cp.y + ny * move * (invA / total) });
      if (invB > 0) rectangle.setPos({ x: rp.x - nx * move * (invB / total), y: rp.y - ny * move * (invB / total) });
      if (distance > 0) {
        const va = circle.getVel(), vb = rectangle.getVel();
        const relative = (va.x - vb.x) * nx + (va.y - vb.y) * ny;
        if (relative < 0) {
          const impulse = this.clamp(-(1 + Math.min(circle.getBounceFactor(), rectangle.getBounceFactor())) * relative / total, -MAX_COLLISION_IMPULSE, MAX_COLLISION_IMPULSE);
          circle.setVel({ x: va.x + impulse * nx * invA, y: va.y + impulse * ny * invA });
          if (invB > 0) rectangle.setVel({ x: vb.x - impulse * nx * invB, y: vb.y - impulse * ny * invB });
        }
      }
    }
    circle.onCollision({ entity: rectangle }); rectangle.onCollision({ entity: circle });
  }

  private resolveCircleLine(circle: IPhysics<SHAPE.CIRCLE>, line: IPhysics<SHAPE.LINE>): void {
    const closest = this.closestPointOnLine(circle, line), position = circle.getPos();
    const normal = this.sub(position, closest), distance = this.mag(normal), radius = circle.getBounds().x;
    if (distance >= radius) return;
    const unit = distance === 0 ? this.normalize({ x: -(line.getBounds().y - line.getPos().y), y: line.getBounds().x - line.getPos().x }) : this.mult(normal, 1 / distance);
    circle.setPos(this.add(closest, this.mult(unit, radius)));
    const velocity = circle.getVel(), normalVelocity = this.dot(velocity, unit);
    if (normalVelocity < 0) circle.setVel(this.sub(velocity, this.mult(unit, (1 + Math.min(circle.getBounceFactor(), line.getBounceFactor())) * normalVelocity)));
    circle.onCollision({ entity: line }); line.onCollision({ entity: circle });
  }

  public getFriction(): number { return this.friction; }
  public getStopThreshold(): number { return this.stopThreshold; }
  public applyImpulse(entity: IPhysics<any>, angle: number, power: number): void {
    if (!Number.isFinite(entity.getMass())) return;
    const radians = angle * Math.PI / 180, velocity = entity.getVel(), force = power / entity.getMass();
    entity.setVel({ x: velocity.x + Math.cos(radians) * force, y: velocity.y + Math.sin(radians) * force });
  }
  public applyFriction(entity: IPhysics<any>, dt: number): void {
    let { x, y } = entity.getVel(); const factor = this.friction ** dt; x *= factor; y *= factor;
    const speed = Math.hypot(x, y); if (speed > 0) { const next = Math.max(0, speed - this.linearDrag * dt); const scale = next / speed; x *= scale; y *= scale; }
    if (Math.hypot(x, y) < this.stopThreshold) { x = 0; y = 0; } entity.setVel({ x, y });
  }
  public calculateStopFromInput(start: Vector2D, angle: number, power: number): Vector2D { const radians = angle * Math.PI / 180; return this.calculateStop(start, { x: Math.cos(radians) * power, y: Math.sin(radians) * power }); }
  public calculateStop(start: Vector2D, initial: Vector2D): Vector2D {
    let x = start.x, y = start.y, vx = initial.x, vy = initial.y;
    for (let i = 0; i < 2000; i++) { vx *= this.friction; vy *= this.friction; const speed = Math.hypot(vx, vy); if (speed < this.stopThreshold || speed === 0) break; const next = Math.max(0, speed - this.linearDrag), scale = next / speed; vx *= scale; vy *= scale; x += vx; y += vy; }
    return { x, y };
  }
  public printSettings(who?: string): void { console.info(who, "Set Physics to:", this.toSettings()); }
  public isStatic(collection: PhysicsEntityCollection): boolean { return [...collection.getEntities()].filter(entity => entity.physicsEnabled()).every(entity => Math.abs(entity.getVel().x) < 0.1 && Math.abs(entity.getVel().y) < 0.1); }
  public toSettings(): PhysicsSettings { return { friction: this.friction, linearDrag: this.linearDrag, stopThreshold: this.stopThreshold }; }
  private closestPointOnLine(circle: IPhysics<SHAPE.CIRCLE>, line: IPhysics<SHAPE.LINE>): Vector2D { const start = line.getPos(), end = line.getBounds(), segment = this.sub(end, start), lengthSq = this.magSq(segment), factor = lengthSq === 0 ? 0 : this.clamp(this.dot(this.sub(circle.getPos(), start), segment) / lengthSq, 0, 1); return this.add(start, this.mult(segment, factor)); }
}

export function createDefaultPhysicsStrategy(options: DefaultPhysicsStrategyOptions = {}): DefaultPhysicsStrategy { return new DefaultPhysicsStrategy(options); }
