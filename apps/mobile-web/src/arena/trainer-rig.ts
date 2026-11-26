import { Bone, Group, MathUtils, Quaternion, Vector3, type Object3D } from "three";
import { LM, type Landmark } from "@motion-arena/shared";

const SIDES = ["Left", "Right"] as const;
const X = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
/** Grenzen gegen Ausreißer der Erkennung (Bogenmaß). */
const MAX_PELVIS_ROLL = 0.45;
const MAX_CHEST_TWIST = 0.9;
const MAX_WRIST_BEND = 1.2;

export const JOINTS = ["LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"] as const;

interface BonePair {
  bone: Bone;
  child: Bone;
}

interface Arm {
  upper: BonePair;
  lower: BonePair;
  upperLength: number;
  lowerLength: number;
}

export class TrainerRig {
  readonly root = new Group();
  private readonly bones = new Map<string, Bone>();
  private readonly rest = new Map<Bone, Quaternion>();
  private readonly hips: Bone;
  private readonly neck: Bone | null;
  /** Wirbelsäule von unten nach oben (3 Glieder) – unabhängig von der Benennung (Spine02→Spine01→Spine bzw. Spine→Spine1→Spine2). */
  private readonly spine: [Bone, Bone, Bone];
  private readonly home: Vector3;
  /** Körpermaße relativ zu Lukas (Beinlänge 0,766 m, Schulter 0,21 m seitlich) – die geführte Hocke passt sich an. */
  private readonly legScale: number;
  private readonly widthScale: number;
  private readonly legs: Array<{ upper: BonePair; lower: BonePair; foot: Bone; toe: Quaternion; lengthA: number; lengthB: number; target: Vector3 }>;
  private readonly arms: Arm[];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly c = new Vector3();
  private readonly direction = new Vector3();
  private readonly q = new Quaternion();
  private readonly parent = new Quaternion();
  /** Zuletzt erkannte Richtung je Knochen: kurz verdeckte Glieder behalten sie, statt in die Grundhaltung zu springen. */
  private readonly lastDirection = new Map<Bone, Vector3>();

  constructor(model: Object3D) {
    this.root.add(model);
    model.traverse((node) => {
      if (node instanceof Bone) {
        this.bones.set(node.name, node);
        this.rest.set(node, node.quaternion.clone());
      }
    });
    this.root.updateMatrixWorld(true);
    this.hips = this.bone("Hips");
    this.neck = this.bones.get("neck") ?? this.bones.get("Neck") ?? null;
    this.spine = spineChain(this.hips);
    this.home = this.hips.getWorldPosition(new Vector3());
    const upLeg = this.bone("LeftUpLeg").getWorldPosition(new Vector3());
    const ankle = this.bone("LeftFoot").getWorldPosition(new Vector3());
    const shoulder = this.bone("LeftArm").getWorldPosition(new Vector3());
    this.legScale = MathUtils.clamp((upLeg.y - ankle.y) / 0.766, 0.7, 1.3);
    this.widthScale = MathUtils.clamp(Math.abs(shoulder.x) / 0.21, 0.7, 1.3);
    // Knöchel etwa schulterbreit (Lukas ±0,24 m), nicht breiter – sonst wird die Hocke zur Grätsche
    const stance = 0.24 * this.widthScale;
    this.legs = SIDES.map((side, i) => {
      const upper = this.pair(`${side}UpLeg`, `${side}Leg`);
      const lower = this.pair(`${side}Leg`, `${side}Foot`);
      const foot = lower.child;
      const sign = i === 0 ? 1 : -1;
      const toe = new Quaternion().setFromAxisAngle(UP, sign * 0.19).multiply(foot.getWorldQuaternion(new Quaternion()));
      const target = foot.getWorldPosition(new Vector3());
      const lengthB = lower.bone.getWorldPosition(new Vector3()).distanceTo(target);
      target.x = sign * stance;
      return {
        upper, lower, foot, toe, target,
        lengthA: upper.bone.getWorldPosition(new Vector3()).distanceTo(upper.child.getWorldPosition(new Vector3())),
        lengthB,
      };
    });
    this.arms = SIDES.map((side) => {
      const upper = this.pair(`${side}Arm`, `${side}ForeArm`);
      const lower = this.pair(`${side}ForeArm`, `${side}Hand`);
      const shoulder = upper.bone.getWorldPosition(new Vector3());
      const elbow = lower.bone.getWorldPosition(new Vector3());
      const wrist = lower.child.getWorldPosition(new Vector3());
      return { upper, lower, upperLength: shoulder.distanceTo(elbow), lowerLength: elbow.distanceTo(wrist) };
    });
  }

  private bone(name: string): Bone {
    const bone = this.bones.get(name);
    if (!bone) throw new Error(`Fehlender Trainer-Knochen: ${name}`);
    return bone;
  }

  private pair(bone: string, child: string): BonePair {
    return { bone: this.bone(bone), child: this.bone(child) };
  }

  /** Knochen um eine Drehung im Weltraum drehen (Kinder drehen mit). */
  private rotateWorld(bone: Bone, rotation: Quaternion): void {
    const parent = bone.parent!.getWorldQuaternion(this.parent);
    bone.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
    bone.updateWorldMatrix(false, true);
  }

  private aim(pair: BonePair, direction: Vector3): void {
    pair.bone.quaternion.copy(this.rest.get(pair.bone)!);
    pair.bone.updateWorldMatrix(true, true);
    const from = pair.child.getWorldPosition(this.a).sub(pair.bone.getWorldPosition(this.b)).normalize();
    const parent = pair.bone.parent!.getWorldQuaternion(this.parent);
    this.q.setFromUnitVectors(from, direction.normalize());
    pair.bone.quaternion.premultiply(parent.clone().invert().multiply(this.q).multiply(parent));
  }

  pose(flex: number): void {
    const t = MathUtils.clamp(flex / 100, 0, 1);
    const hip = this.c.copy(this.home);
    hip.y -= (0.027 + 0.45 * t ** 1.13) * this.legScale;
    hip.z -= 0.275 * t * this.legScale;
    this.root.localToWorld(hip);
    this.hips.position.copy(this.hips.parent!.worldToLocal(hip));

    for (const [index, { upper, lower, foot, toe, lengthA, lengthB, target }] of this.legs.entries()) {
      const sign = index === 0 ? 1 : -1;
      const start = this.root.worldToLocal(upper.bone.getWorldPosition(new Vector3()));
      const toward = target.clone().sub(start);
      const distance = Math.min(toward.length(), lengthA + lengthB - 0.001);
      toward.normalize();
      const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
      const bend = new Vector3(sign * 0.63, 0, 1);
      bend.addScaledVector(toward, -bend.dot(toward)).normalize();
      const knee = start.clone().addScaledVector(toward, along).addScaledVector(bend, Math.sqrt(Math.max(0, lengthA * lengthA - along * along)));
      const rotation = this.root.getWorldQuaternion(new Quaternion());
      this.aim(upper, knee.clone().sub(start).applyQuaternion(rotation));
      this.aim(lower, target.clone().sub(knee).applyQuaternion(rotation));
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(this.parent).invert().multiply(rotation).multiply(toe));
    }

    for (const [bone, factor] of [[this.spine[0], 0.39], [this.spine[1], 0.17], [this.spine[2], 0.09], [this.bone("Head"), -0.24]] as const) {
      bone.quaternion.copy(this.rest.get(bone)!).premultiply(this.q.setFromAxisAngle(X, factor * t));
    }

    const rotation = this.root.getWorldQuaternion(new Quaternion());
    const lift = MathUtils.smoothstep(t, 0.04, 0.71);
    for (const [index, { upper, lower, upperLength, lowerLength }] of this.arms.entries()) {
      const sign = index === 0 ? 1 : -1;
      const shoulder = this.root.worldToLocal(upper.bone.getWorldPosition(new Vector3()));
      // Keep the wrists outside the hips at rest and in front of the chest throughout the lift.
      const k = this.legScale;
      const wrist = new Vector3(sign * MathUtils.lerp(0.306, 0.063, lift) * this.widthScale,
        MathUtils.lerp((0.890 - 0.11 * t) * k, shoulder.y - 0.032 * k, lift),
        MathUtils.lerp(0.125 * k, shoulder.z + 0.255 * k, lift));
      const toward = wrist.clone().sub(shoulder);
      const distance = MathUtils.clamp(toward.length(), Math.abs(upperLength - lowerLength) + 0.002, upperLength + lowerLength - 0.002);
      toward.normalize();
      wrist.copy(shoulder).addScaledVector(toward, distance);
      const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
      const bend = new Vector3(sign * 0.45, -0.88, -0.13);
      bend.addScaledVector(toward, -bend.dot(toward)).normalize();
      const elbow = shoulder.clone().addScaledVector(toward, along)
        .addScaledVector(bend, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
      this.aim(upper, elbow.clone().sub(shoulder).applyQuaternion(rotation));
      this.aim(lower, wrist.sub(elbow).applyQuaternion(rotation));
    }
  }

  /** Retarget the detected torso and limb directions onto the fixed proportions of this rig. */
  /**
   * Figur folgt den Körperpunkten. `mirror`: wie ein Spiegel – die Figur bewegt die Seite, die auf dem Bildschirm
   * auf derselben Seite liegt wie dein bewegter Arm/Bein (deine linke Seite → ihre rechte, seitenverkehrt).
   */
  follow(landmarks: Landmark[], aspect: number, metric: boolean, depthInImageHeight: boolean, mirror = false): boolean {
    const sx = mirror ? -1 : 1;
    const side = (index: number) => (mirror ? MIRROR_INDEX[index] ?? index : index);
    const at = (index: number) => {
      const p = landmarks[side(index)];
      if (!p || p.visibility < 0.45 || ![p.x, p.y, p.z].every(Number.isFinite)) return null;
      return new Vector3(sx * p.x * (metric ? 1 : aspect), -p.y, -p.z * (metric || depthInImageHeight ? 1 : aspect));
    };
    const hipLeft = at(LM.LEFT_HIP);
    const hipRight = at(LM.RIGHT_HIP);
    const shoulderLeft = at(LM.LEFT_SHOULDER);
    const shoulderRight = at(LM.RIGHT_SHOULDER);
    if (!hipLeft || !hipRight || !shoulderLeft || !shoulderRight) return false;
    const pelvis = hipLeft.clone().lerp(hipRight, 0.5);
    const trunk = shoulderLeft.clone().lerp(shoulderRight, 0.5).sub(pelvis);
    if (trunk.lengthSq() < 1e-5) return false;

    for (const [bone, rest] of this.rest) bone.quaternion.copy(rest);
    this.root.updateWorldMatrix(true, true);
    const h = this.hips.parent!;
    this.hips.position.copy(h.worldToLocal(this.root.localToWorld(this.c.copy(this.home))));
    // Becken: Drehung (Hüftlinie in der Draufsicht) und seitliche Kippung (Hüftlinie in der Frontansicht)
    const hipAxis = hipLeft.clone().sub(hipRight);
    const yaw = Math.atan2(-hipAxis.z, hipAxis.x);
    const roll = MathUtils.clamp(Math.atan2(hipAxis.y, Math.hypot(hipAxis.x, hipAxis.z)), -MAX_PELVIS_ROLL, MAX_PELVIS_ROLL);
    this.hips.quaternion.premultiply(this.q.setFromAxisAngle(UP, yaw).multiply(new Quaternion().setFromAxisAngle(FORWARD, roll)));
    this.hips.updateWorldMatrix(true, true);
    this.aim({ bone: this.spine[0], child: this.spine[1] }, trunk.clone());

    // Oberkörper gegen die Hüfte verdreht (Schulterlinie um die Rumpfachse): halb Brust-, halb oberes Wirbelglied
    const leftArm = this.arms[0]!.upper.bone;
    const rightArm = this.arms[1]!.upper.bone;
    const axis = trunk.clone().normalize();
    const flat = (v: Vector3) => v.addScaledVector(axis, -v.dot(axis));
    const current = flat(leftArm.getWorldPosition(new Vector3()).sub(rightArm.getWorldPosition(new Vector3())));
    const wanted = flat(shoulderLeft.clone().sub(shoulderRight));
    if (current.lengthSq() > 1e-6 && wanted.lengthSq() > 1e-6) {
      const twist = MathUtils.clamp(current.normalize().angleTo(wanted.normalize()), 0, MAX_CHEST_TWIST);
      const sign = Math.sign(current.clone().cross(wanted).dot(axis)) || 1;
      for (const bone of [this.spine[1], this.spine[2]]) this.rotateWorld(bone, this.q.setFromAxisAngle(axis, (sign * twist) / 2));
    }

    const aimBetween = (pair: BonePair, a: Vector3 | null, b: Vector3 | null) => {
      if (a && b && this.direction.subVectors(b, a).lengthSq() > 1e-5) {
        this.lastDirection.set(pair.bone, this.direction.clone().normalize());
        this.aim(pair, this.direction);
      } else {
        const last = this.lastDirection.get(pair.bone);
        if (last) this.aim(pair, this.direction.copy(last));
      }
    };
    const joints = [
      [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_INDEX, LM.LEFT_PINKY],
      [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_INDEX, LM.RIGHT_PINKY],
    ] as const;
    for (const [i, [hip, knee, ankle, toe, shoulder, elbow, wrist, index, pinky]] of joints.entries()) {
      const leg = this.legs[i]!;
      const arm = this.arms[i]!;
      aimBetween(leg.upper, at(hip), at(knee));
      aimBetween(leg.lower, at(knee), at(ankle));
      aimBetween(this.pair(leg.foot.name, `${SIDES[i]}ToeBase`), at(ankle), at(toe));
      aimBetween(arm.upper, at(shoulder), at(elbow));
      aimBetween(arm.lower, at(elbow), at(wrist));
      // Handgelenk: Hand zeigt vom Handgelenk zur Mitte der Fingerknöchel (begrenzt, Handpunkte sind unruhig)
      const w = at(wrist), ix = at(index), px = at(pinky);
      const hand = this.bones.get(`${SIDES[i]}Hand`);
      if (hand && w && ix && px) {
        const forearm = hand.getWorldPosition(new Vector3()).sub(arm.lower.bone.getWorldPosition(new Vector3())).normalize();
        const target = ix.clone().lerp(px, 0.5).sub(w);
        if (target.lengthSq() > 1e-6) {
          target.normalize();
          const bend = Math.min(forearm.angleTo(target), MAX_WRIST_BEND);
          const rot = new Quaternion().setFromUnitVectors(forearm, target);
          this.rotateWorld(hand, new Quaternion().slerp(rot, bend / Math.max(forearm.angleTo(target), 1e-6)));
        }
      }
    }

    // Kopf: Hals neigt sich zur Ohrmitte, Gesicht dreht/nickt in Richtung Nase
    const earLeft = at(LM.LEFT_EAR), earRight = at(LM.RIGHT_EAR), nose = at(LM.NOSE);
    const neck = this.neck;
    if (neck && earLeft && earRight) {
      const shoulderMid = shoulderLeft.clone().lerp(shoulderRight, 0.5);
      const earMid = earLeft.clone().lerp(earRight, 0.5);
      aimBetween({ bone: neck, child: this.bone("Head") }, shoulderMid, earMid);
      const front = this.bones.get("headfront");
      if (nose && front) aimBetween({ bone: this.bone("Head"), child: front }, earMid, nose);
    }

    const feet = this.legs.map(({ foot }) => foot.getWorldPosition(new Vector3()).y);
    const floor = Math.min(...feet);
    const head = this.bone("Head").getWorldPosition(new Vector3()).y;
    this.root.position.y -= Math.min(floor - 0.115, head - 0.32);
    return true;
  }

  joint(name: (typeof JOINTS)[number], at: Vector3): Vector3 {
    return this.bone(name).getWorldPosition(at);
  }
}

/** Wirbelsäulenkette ab der Hüfte nach oben über die Hierarchie bestimmen (Benennung unterscheidet sich je Modell). */
function spineChain(hips: Bone): [Bone, Bone, Bone] {
  const chain: Bone[] = [];
  let node: Bone | undefined = hips;
  while (chain.length < 3) {
    const next: Bone | undefined = node?.children.find((c): c is Bone => c instanceof Bone && /spine/i.test(c.name));
    if (!next) break;
    chain.push(next);
    node = next;
  }
  if (chain.length < 3) throw new Error("Fehlende Trainer-Wirbelsäule (3 Glieder ab Hips)");
  return chain as [Bone, Bone, Bone];
}

/** Linke ↔ rechte Körperpunkte (MediaPipe-Indizes) für die Spiegelung. */
const MIRROR_INDEX: Record<number, number> = (() => {
  const pairs: Array<[number, number]> = [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_ELBOW, LM.RIGHT_ELBOW], [LM.LEFT_WRIST, LM.RIGHT_WRIST],
    [LM.LEFT_HIP, LM.RIGHT_HIP], [LM.LEFT_KNEE, LM.RIGHT_KNEE], [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
    [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX], [LM.LEFT_HEEL, LM.RIGHT_HEEL],
    [LM.LEFT_EAR, LM.RIGHT_EAR], [LM.LEFT_PINKY, LM.RIGHT_PINKY], [LM.LEFT_INDEX, LM.RIGHT_INDEX], [21, 22],
    [1, 4], [2, 5], [3, 6], [9, 10],
  ];
  const map: Record<number, number> = {};
  for (const [a, b] of pairs) {
    map[a] = b;
    map[b] = a;
  }
  return map;
})();
