import type { Vector2D } from "@coffeemakerstudio/roast";
/** Generic serializable physics settings; game maps may extend this shape. */
export interface PhysicsSettings {
    friction: number;
    linearDrag: number;
    stopThreshold: number;
}
export interface SettingsSerializable<TSettings> {
    toSettings(): TSettings;
}
/** Collection boundary used only to determine whether physical bodies are settled. */
export interface PhysicsEntityCollection {
    getEntities(): Iterable<{
        isDead(): boolean;
        physicsEnabled(): boolean;
        getVel(): Vector2D;
    }>;
}
/**
 * Ein Punkt oder eine Richtung im 2D-Raum.
 *
 * Stell es dir wie ein Koordinatensystem vor:
 * - X: Horizontale Position (Links/Rechts)
 * - Y: Vertikale Position (Oben/Unten)
 */
/**
 * Distance tolerance for the touching/penetrating boundary. Detection treats
 * touching as contact (inclusive), response acts only on strict penetration.
 */
export declare const PHYSICS_CONTACT_EPSILON = 1e-9;
/**
 * Residual overlap exempt from circle/circle positional correction. Overlap
 * at or below the slop is intentional and stable (never oscillates).
 */
export declare const PHYSICS_CONTACT_SLOP = 0.05;
/** Fraction of `max(overlap - slop, 0)` resolved per circle/circle call. */
export declare const PHYSICS_CONTACT_PERCENT = 0.2;
/** Upper bound for multi-contact solver passes (Section 13.5). */
export declare const MAX_CONTACT_SOLVER_ITERATIONS = 16;
/** Maximum spatial displacement per substep before CCD triggers subdivision (Section 13.6). */
export declare const CCD_MAX_STEP_SIZE = 4;
/** Upper bound for continuous collision detection substeps per tick (Section 13.6). */
export declare const MAX_CCD_SUBSTEPS = 16;
/** Per-contact impulse magnitude clamp (circle/rectangle exterior contacts). */
export declare const MAX_COLLISION_IMPULSE = 50;
/**
 * A resolved contact between two bodies. The normal always points from body A
 * toward body B for circle/circle contacts and from the structure toward the
 * circle for structure contacts.
 */
export interface PhysicsContact {
    /** Unit contact normal (from A to B / from structure to circle). */
    normal: Vector2D;
    /** Penetration depth; `0` for a pure touching contact. */
    overlap: number;
    /** Shape-pair classification of the contact. */
    kind: "circle-circle" | "circle-rectangle" | "circle-line" | "rectangle-rectangle";
}
/** JSON-safe contact lifecycle state at a completed physics-tick boundary. */
export interface PhysicsContactState {
    /** Sorted canonical `entity:<id>|entity:<id>` / `entity:<id>|structure:<id>` keys. */
    activePairs: string[];
}
/** Shared physical-participation boundary used by ticking and settlement. */
export declare function isPhysicsParticipant(entity: {
    isDead(): boolean;
    physicsEnabled(): boolean;
}): boolean;
/** True when both vector components are finite numbers. */
export declare function isFiniteVector(v: Vector2D): boolean;
/** The body properties the validity contract checks (Section 13). */
export interface PhysicsBodyState {
    position: Vector2D;
    velocity: Vector2D;
    bounds: Vector2D;
    mass: number;
    bounceFactor: number;
    shape: SHAPE;
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
export declare function validatePhysicsBody(body: PhysicsBodyState): void;
/** Returns the unit forward vector for a clockwise screen-space rotation in degrees. */
export declare function forwardVectorFromRotation(rotation: number): Vector2D;
/**
 * Explicit structure role separating containment geometry from solid obstacles.
 *
 * - `undefined` (default): the structure is a solid obstacle unless the outer
 *   containment heuristic recognizes it as the enclosing arena boundary, in
 *   which case it serves containment only and never resolves as filled.
 * - `"solid"`: explicitly a filled obstacle; never interpreted as containment.
 * - `"containment"`: explicitly a containment boundary only; never resolves as
 *   a filled obstacle, even when it does not enclose every other structure.
 * - `"both"`: explicitly containment AND a filled obstacle (the pre-12.1
 *   arena-rect behavior, preserved for fixtures that depend on it).
 */
export type StructureCollisionRole = "solid" | "containment" | "both";
/** Validates a serialized structure-role value. */
export declare function isStructureCollisionRole(value: unknown): value is StructureCollisionRole;
/**
 * A physics object that additionally reports an explicit collision role.
 * Only map structures carry roles; entities never do.
 */
export type RoleAwarePhysics = IPhysics<SHAPE> & {
    getCollisionRole(): StructureCollisionRole | undefined;
};
/**
 * Das mathematische Gehirn der Engine.
 *
 * Dieses Interface erzwingt, dass jede Physik-Implementierung (z.B. Arcade, Realistic)
 * sowohl die Rechenlogik (Vektoren) als auch die physikalischen Regeln (Kollision) definiert.
 */
export interface PhysicsStrategy extends SettingsSerializable<PhysicsSettings> {
    /** Berechnet den Abprall-Vektor (wie ein Ball an der Wand). */
    calculateBounce(vel: Vector2D, normal: Vector2D): Vector2D;
    /** Plus: Rechnet zwei Vektoren zusammen. */
    add(a: Vector2D, b: Vector2D): Vector2D;
    /** Minus: Zieht Vektor B von A ab. */
    sub(a: Vector2D, b: Vector2D): Vector2D;
    /** Mal: Macht einen Vektor um einen Faktor länger oder kürzer. */
    mult(a: Vector2D, b: number): Vector2D;
    /** Berechnet das Punktprodukt (hilft z.B. Winkel zwischen Objekten zu bestimmen). */
    dot(a: Vector2D, b: Vector2D): number;
    /** Länge des Vektors zum Quadrat (schneller als mag). */
    magSq(v: Vector2D): number;
    /** Die echte Länge eines Vektors (Abstand von Nullpunkt). */
    mag(v: Vector2D): number;
    /** Kürzt den Vektor auf die Länge 1 (nur noch die Richtung bleibt übrig). */
    normalize(v: Vector2D): Vector2D;
    /** Berechnet den Abstand zwischen zwei Punkten. */
    dist(a: Vector2D, b: Vector2D): number;
    /** Abstand im Quadrat (gut für schnelle Entfernungs-Checks). */
    distSq(a: Vector2D, b: Vector2D): number;
    /** Hält eine Zahl innerhalb von Min und Max fest. */
    clamp(val: number, min: number, max: number): number;
    /** Prüft, ob sich zwei Kreise berühren. */
    checkCollisionCircles(entityA: IPhysics<SHAPE.CIRCLE>, entityB: IPhysics<SHAPE.CIRCLE>): boolean;
    /** Prüft, ob sich zwei Rechtecke überschneiden. */
    checkCollisionRects(entityA: IPhysics<SHAPE.RECTANGLE>, entityB: IPhysics<SHAPE.RECTANGLE>): boolean;
    /** Die All-in-One Prüfung: Erkennt automatisch, welche Formen kollidieren. */
    checkCollision(entityA: IPhysics<any>, entityB: IPhysics<any>): boolean;
    /** Spezialprüfung: Kollision zwischen einem Kreis und einem Rechteck. */
    checkCollisionCircleRect(entityA: IPhysics<SHAPE.CIRCLE>, entityB: IPhysics<SHAPE.RECTANGLE>): boolean;
    checkCollisionCircleLine(entityA: IPhysics<SHAPE.CIRCLE>, entityB: IPhysics<SHAPE.LINE>): boolean;
    /** Löst die Kollision auf (schubst Objekte auseinander, damit sie nicht ineinander stecken). */
    handleCollision(entityA: IPhysics<any>, entityB: IPhysics<any>): void;
    /** Gibt den aktuellen Reibungswert zurück. */
    getFriction(): number;
    getStopThreshold(): number;
    /** Gibt einem Objekt einen Stoß in eine bestimmte Richtung mit einer gewissen Kraft. */
    applyImpulse(entity: IPhysics<any>, angle: number, power: number): void;
    /** Verlangsamt ein Objekt basierend auf der Zeit (bremst es ab). */
    applyFriction(entity: IPhysics<any>, dt: number): void;
    /** Sagt voraus, wo ein Objekt stehen bleiben wird (Bremspfad-Vorschau). */
    calculateStop(startPos: Vector2D, initialVel: Vector2D): Vector2D;
    /** Sagt voraus, wo ein Objekt nach einem geplanten Stoß landen wird. */
    calculateStopFromInput(startPos: Vector2D, angle: number, power: number): Vector2D;
    /** Schreibt die aktuellen Einstellungen der Physik-Engine in die Konsole. */
    printSettings(who?: string): void;
    isStatic(entity: PhysicsEntityCollection): boolean;
}
/**
 * Die physikalischen Grundeigenschaften für jedes Objekt im Spiel.
 * Hier legst du fest, wie schwer ein Objekt ist, wie schnell es sich bewegt und was passiert, wenn es knallt.
 */
export interface IdefaultPhysics {
    /** Setzt die aktuelle Geschwindigkeit. */
    setVel(vel: Vector2D): void;
    /** Setzt das Gewicht des Objekts (Wichtig für Kollisionen: Schwer schubst Leicht). */
    setMass(mass: number): void;
    /** Teleportiert das Objekt an eine bestimmte Stelle. */
    setPos(pos: Vector2D): void;
    getPos(): Vector2D;
    /** Wie stark das Objekt von selbst abbremst (Gelände-Abhängig). */
    getFriction(): number | undefined;
    setFriction(friction: number): void;
    getMass(): number;
    getVel(): Vector2D;
    /**
     * Diese Funktion wird aufgerufen, wenn das Objekt etwas berührt.
     * Hier kann man z.B. Sounds abspielen oder Punkte zählen.
     */
    onCollision({ entity }: {
        entity: IPhysics<SHAPE>;
    }): void;
    setBounceFactor(bounce: number): void;
    /** Wie stark das Objekt abprallt (0 = gar nicht, 1 = wie ein Gummiball). */
    getBounceFactor(): number;
    getBounds(): Vector2D;
    physicsEnabled(): boolean;
    setPhysicsEnabled(physicsEnabled: boolean): void;
    getShape(): SHAPE;
}
/** Ein rundes Objekt (z.B. ein Ball oder ein Spieler-Pin). */
export interface CirclePhysics extends IdefaultPhysics {
    getShape(): SHAPE.CIRCLE;
}
/** Ein eckiges Objekt (z.B. eine Wand, ein Tor oder ein Hindernis). */
export interface RectanglePhysics extends IdefaultPhysics {
    getShape(): SHAPE.RECTANGLE;
}
export interface LinePhysics extends IdefaultPhysics {
    getShape(): SHAPE.LINE;
}
/**
 * Kombi-Typ: Ein Objekt in der Physik-Engine ist ENTWEDER ein Kreis ODER ein Rechteck.
 * (Es kann in der Zukunft Erweitert werden, aber aktuell sind es nur die 2) */
export declare enum SHAPE {
    CIRCLE = 0,
    LINE = 1,
    RECTANGLE = 2
}
export type PhyicsMap = {
    [SHAPE.CIRCLE]: CirclePhysics;
    [SHAPE.RECTANGLE]: RectanglePhysics;
    [SHAPE.LINE]: LinePhysics;
};
export type IPhysics<T extends SHAPE> = PhyicsMap[T];
export declare function getShapeName(input: SHAPE): string;
