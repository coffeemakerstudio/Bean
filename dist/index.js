// src/physics.ts
var PHYSICS_CONTACT_EPSILON = 0.000000001;
var PHYSICS_CONTACT_SLOP = 0.05;
var PHYSICS_CONTACT_PERCENT = 0.2;
var MAX_CONTACT_SOLVER_ITERATIONS = 16;
var CCD_MAX_STEP_SIZE = 4;
var MAX_CCD_SUBSTEPS = 16;
var MAX_COLLISION_IMPULSE = 50;
function isPhysicsParticipant(entity) {
  return !entity.isDead() && entity.physicsEnabled();
}
function isFiniteVector(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}
function validatePhysicsBody(body) {
  if (!isFiniteVector(body.position)) {
    throw new Error(`Invalid physics body: non-finite position (${body.position.x}, ${body.position.y})`);
  }
  if (!isFiniteVector(body.velocity)) {
    throw new Error(`Invalid physics body: non-finite velocity (${body.velocity.x}, ${body.velocity.y})`);
  }
  if (!Number.isFinite(body.bounds.x) || !Number.isFinite(body.bounds.y) || body.bounds.x < 0 || body.bounds.y < 0) {
    throw new Error(`Invalid physics body: bounds must be finite and non-negative, got (${body.bounds.x}, ${body.bounds.y})`);
  }
  if (body.shape === 0 /* CIRCLE */ && body.bounds.x <= 0) {
    throw new Error(`Invalid physics body: a circle needs a positive radius, got ${body.bounds.x}`);
  }
  if (body.mass !== Infinity && (!Number.isFinite(body.mass) || body.mass <= 0)) {
    throw new Error(`Invalid physics body: mass must be positive or Infinity, got ${body.mass}`);
  }
  if (body.bounceFactor !== Infinity && (!Number.isFinite(body.bounceFactor) || body.bounceFactor < 0 || body.bounceFactor > 1)) {
    throw new Error(`Invalid physics body: bounce factor must be within [0, 1] or Infinity, got ${body.bounceFactor}`);
  }
}
function forwardVectorFromRotation(rotation) {
  const radians = rotation * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
function isStructureCollisionRole(value) {
  return value === "solid" || value === "containment" || value === "both";
}
var SHAPE;
((SHAPE2) => {
  SHAPE2[SHAPE2["CIRCLE"] = 0] = "CIRCLE";
  SHAPE2[SHAPE2["LINE"] = 1] = "LINE";
  SHAPE2[SHAPE2["RECTANGLE"] = 2] = "RECTANGLE";
})(SHAPE ||= {});
function getShapeName(input) {
  switch (input) {
    case 0 /* CIRCLE */:
      return "circle";
    case 2 /* RECTANGLE */:
      return "rectangle";
    case 1 /* LINE */:
      return "line";
    default:
      return "TODO";
  }
}
export {
  validatePhysicsBody,
  isStructureCollisionRole,
  isPhysicsParticipant,
  isFiniteVector,
  getShapeName,
  forwardVectorFromRotation,
  SHAPE,
  PHYSICS_CONTACT_SLOP,
  PHYSICS_CONTACT_PERCENT,
  PHYSICS_CONTACT_EPSILON,
  MAX_CONTACT_SOLVER_ITERATIONS,
  MAX_COLLISION_IMPULSE,
  MAX_CCD_SUBSTEPS,
  CCD_MAX_STEP_SIZE
};
