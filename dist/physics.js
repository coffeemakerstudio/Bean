/**
 * Ein Punkt oder eine Richtung im 2D-Raum.
 *
 * Stell es dir wie ein Koordinatensystem vor:
 * - X: Horizontale Position (Links/Rechts)
 * - Y: Vertikale Position (Oben/Unten)
 */
// --- Contact And Resolution Contract (Section 13.1, docs/physics-contract.md) ---
/**
 * Distance tolerance for the touching/penetrating boundary. Detection treats
 * touching as contact (inclusive), response acts only on strict penetration.
 */
export const PHYSICS_CONTACT_EPSILON = 1e-9;
/**
 * Residual overlap exempt from circle/circle positional correction. Overlap
 * at or below the slop is intentional and stable (never oscillates).
 */
export const PHYSICS_CONTACT_SLOP = 0.05;
/** Fraction of `max(overlap - slop, 0)` resolved per circle/circle call. */
export const PHYSICS_CONTACT_PERCENT = 0.2;
/** Upper bound for multi-contact solver passes (Section 13.5). */
export const MAX_CONTACT_SOLVER_ITERATIONS = 16;
/** Maximum spatial displacement per substep before CCD triggers subdivision (Section 13.6). */
export const CCD_MAX_STEP_SIZE = 4.0;
/** Upper bound for continuous collision detection substeps per tick (Section 13.6). */
export const MAX_CCD_SUBSTEPS = 16;
/** Per-contact impulse magnitude clamp (circle/rectangle exterior contacts). */
export const MAX_COLLISION_IMPULSE = 50;
/** Shared physical-participation boundary used by ticking and settlement. */
export function isPhysicsParticipant(entity) {
    return !entity.isDead() && entity.physicsEnabled();
}
/** True when both vector components are finite numbers. */
export function isFiniteVector(v) {
    return Number.isFinite(v.x) && Number.isFinite(v.y);
}
/**
 * Validates a body against the physics validity contract:
 * - position/velocity must be finite,
 * - bounds must be finite and non-negative (positive for circles),
 * - mass must be strictly positive and finite, or `Infinity` (immovable),
 * - bounce factor must be finite within `[0, 1]`, or `Infinity` (inherit).
 *
 * Throws on the first violation. `validatePhysicsBody` is the boundary check;
 * `handleCollision` additionally guards against non-finite input state so no
 * response can ever produce `NaN` or `Infinity`.
 */
export function validatePhysicsBody(body) {
    if (!isFiniteVector(body.position)) {
        throw new Error(`Invalid physics body: non-finite position (${body.position.x}, ${body.position.y})`);
    }
    if (!isFiniteVector(body.velocity)) {
        throw new Error(`Invalid physics body: non-finite velocity (${body.velocity.x}, ${body.velocity.y})`);
    }
    if (!Number.isFinite(body.bounds.x) || !Number.isFinite(body.bounds.y) || body.bounds.x < 0 || body.bounds.y < 0) {
        throw new Error(`Invalid physics body: bounds must be finite and non-negative, got (${body.bounds.x}, ${body.bounds.y})`);
    }
    if (body.shape === SHAPE.CIRCLE && body.bounds.x <= 0) {
        throw new Error(`Invalid physics body: a circle needs a positive radius, got ${body.bounds.x}`);
    }
    if (body.mass !== Infinity && (!Number.isFinite(body.mass) || body.mass <= 0)) {
        throw new Error(`Invalid physics body: mass must be positive or Infinity, got ${body.mass}`);
    }
    if (body.bounceFactor !== Infinity && (!Number.isFinite(body.bounceFactor) || body.bounceFactor < 0 || body.bounceFactor > 1)) {
        throw new Error(`Invalid physics body: bounce factor must be within [0, 1] or Infinity, got ${body.bounceFactor}`);
    }
}
/** Returns the unit forward vector for a clockwise screen-space rotation in degrees. */
export function forwardVectorFromRotation(rotation) {
    const radians = (rotation * Math.PI) / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
}
/** Validates a serialized structure-role value. */
export function isStructureCollisionRole(value) {
    return value === "solid" || value === "containment" || value === "both";
}
/**
 * Kombi-Typ: Ein Objekt in der Physik-Engine ist ENTWEDER ein Kreis ODER ein Rechteck.
 * (Es kann in der Zukunft Erweitert werden, aber aktuell sind es nur die 2) */
export var SHAPE;
(function (SHAPE) {
    SHAPE[SHAPE["CIRCLE"] = 0] = "CIRCLE";
    SHAPE[SHAPE["LINE"] = 1] = "LINE";
    SHAPE[SHAPE["RECTANGLE"] = 2] = "RECTANGLE";
})(SHAPE || (SHAPE = {}));
export function getShapeName(input) {
    switch (input) {
        case SHAPE.CIRCLE: return "circle";
        case SHAPE.RECTANGLE: return "rectangle";
        case SHAPE.LINE: return "line";
        default: return "TODO";
    }
}
