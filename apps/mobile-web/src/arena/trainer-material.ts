import { Color, FrontSide, MeshPhysicalMaterial, type MeshStandardMaterial } from "three";

export function makeTrainerMaterial(source: MeshStandardMaterial): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: source.color,
    map: source.map,
    normalMap: source.normalMap,
    normalMapType: source.normalMapType,
    roughnessMap: source.roughnessMap,
    aoMap: source.aoMap,
    side: FrontSide,
    roughness: 0.75,
    metalness: 0,
    ior: 1.46,
    specularIntensity: 0.86,
    sheen: 1,
    sheenColor: new Color("#a1aeb7"),
    sheenRoughness: 0.53,
    clearcoat: 0.34,
    clearcoatRoughness: 0.24,
  });
  material.normalScale.setScalar(0.76);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 clothingPoint;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nclothingPoint = position;");
    shader.fragmentShader = `varying vec3 clothingPoint;
      float trainerDetail(vec3 p) {
        vec3 phase = sin(p * vec3(0.87, 1.12, 1.27) + sin(p.yzx * 0.47) * 1.9);
        return phase.x * phase.y * phase.z;
      }
      ${shader.fragmentShader}`.replace("#include <map_fragment>", `
      #include <map_fragment>
      vec3 texel = diffuseColor.rgb;
      float x = abs(clothingPoint.x);
      float y = clothingPoint.y;
      float collar = 1. - pow(clamp(x / .108, 0., 1.), 1.8);
      float collarLine = 1.485 - collar * .078 * smoothstep(-.015,.078,clothingPoint.z);
      float sleeveLine = .208 + .151 * smoothstep(1.200,1.355,y);
      float shirt = smoothstep(.885,.910,y) * (1. - smoothstep(collarLine,collarLine + .014,y));
      shirt *= 1. - smoothstep(sleeveLine,sleeveLine + .014,x);
      float shorts = smoothstep(.592,.628,y) * (1. - smoothstep(.909,.94,y)) * (1. - smoothstep(.258,.282,x));
      float cloth = max(shirt, shorts);
      float luminance = dot(texel, vec3(.24,.52,.24));
      float folds = .69 + luminance * .72;
      vec3 textileUV = clothingPoint * vec3(341.,456.,377.);
      float weaveFade = 1. - smoothstep(1.3,3.1,length(fwidth(textileUV)));
      float weave = trainerDetail(textileUV) * weaveFade;
      vec3 fabric = vec3(.021,.026,.031) * (folds + weave * .13);
      vec3 nylon = vec3(.016,.020,.024) * (folds + weave * .10);
      float stitch = (1. - smoothstep(.0015,.0048,abs(x - sleeveLine + .009))) * smoothstep(.219,.244,x) * smoothstep(1.255,1.28,y);
      float edge = (1. - smoothstep(.002,.005,abs(y - collarLine + .007))) * (1. - smoothstep(.102,.14,x));
      fabric = mix(fabric, vec3(.054,.058,.062), edge * .58);
      fabric = mix(fabric, vec3(.31,.085,.021), stitch * .68);

      // Break up the source skin's even shine with larger tonal changes and antialiased pores.
      float scalp = smoothstep(1.707,1.759,y);
      float temples = smoothstep(1.646,1.709,y) * (1. - smoothstep(-.017,.048,clothingPoint.z));
      float hair = max(scalp, temples * (1. - smoothstep(.080,.192,luminance)));
      float skinWeight = (1. - cloth) * (1. - hair);
      float textureScale = 1250.;
      float poreFade = 1. - smoothstep(.85,2.9,length(fwidth(clothingPoint)) * textureScale);
      float pores = trainerDetail(clothingPoint * textureScale) * poreFade;
      float fineSkin = trainerDetail(clothingPoint * 340.) * (1. - smoothstep(1.8,3.4,length(fwidth(clothingPoint)) * 340.));
      float mottling = trainerDetail(clothingPoint * 112.) * .024 + trainerDetail(clothingPoint * 39.) * .032;
      vec3 cheek = (vec3(x,y,clothingPoint.z) - vec3(.051,1.634,.073)) / vec3(.030,.029,.043);
      float blush = exp(-dot(cheek,cheek) * 1.35);
      vec2 knee = (vec2(x,y) - vec2(.14,.54)) / vec2(.070,.058);
      vec2 elbow = (vec2(x,y) - vec2(.355,1.143)) / vec2(.062,.040);
      float warmth = max(exp(-dot(knee,knee)) * smoothstep(-.01,.058,clothingPoint.z), exp(-dot(elbow,elbow)) * .55);
      vec3 skin = texel * vec3(.975,.895,.822) * (1. + mottling + fineSkin * .013 + pores * .024);
      skin += vec3(.026,.006,.003) * blush + vec3(.016,.004,.002) * warmth;
      vec3 hairColor = mix(vec3(.014,.007,.004), vec3(.076,.033,.014), smoothstep(.018,.24,luminance));
      skin = mix(skin,hairColor,hair);
      diffuseColor.rgb = mix(mix(skin, nylon, shorts), fabric, shirt);
      // The sneaker mesh covers the toes and sole.
      if (y < .058) discard;
    `).replace("#include <roughnessmap_fragment>", `
      #include <roughnessmap_fragment>
      float faceOil = (1. - smoothstep(.024,.066,x)) * smoothstep(1.575,1.617,y) * (1. - smoothstep(1.688,1.731,y));
      float skinRoughness = clamp(.51 + .17 * (roughnessFactor - .5) - .11 * faceOil + .035 * pores,.34,.66);
      float textileRoughness = mix(.65,.73,shirt) + weave * .052;
      roughnessFactor = mix(mix(skinRoughness,.56,hair),textileRoughness,cloth);
    `).replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      vec3 surfaceDx = dFdx(-vViewPosition);
      vec3 surfaceDy = dFdy(-vViewPosition);
      vec3 tangentU = cross(surfaceDy,normal);
      vec3 tangentV = cross(normal,surfaceDx);
      float surfaceArea = dot(surfaceDx,tangentU);
      float relief = (pores * .00013 + fineSkin * .00014) * skinWeight + weave * cloth * .00019;
      normal = normalize(normal * max(abs(surfaceArea),1e-12) - sign(surfaceArea) * (dFdx(relief)*tangentU + dFdy(relief)*tangentV));
    `).replace("#include <lights_physical_fragment>", `
      #include <lights_physical_fragment>
      #ifdef USE_SHEEN
        material.sheenColor *= cloth * mix(.17,.32,shirt) * (.84 + .29 * folds);
        material.sheenRoughness = mix(.49,.61,shirt);
      #endif
      #ifdef USE_CLEARCOAT
        material.clearcoat *= (skinWeight * .52 + hair * .09 + shorts * .09 + shirt * .05);
        material.clearcoatRoughness = mix(.31,.45,cloth);
      #endif
    `).replace("#include <lights_fragment_end>", `
      #include <lights_fragment_end>
      // Warm wrap near the key-light terminator approximates light scattering through skin.
      vec3 keyDirection = normalize(mat3(viewMatrix) * vec3(-3.9,3.5,1.9));
      float facing = dot(normal,keyDirection);
      float wrap = max(0.,(facing + .27) / 1.27) - max(0.,facing);
      reflectedLight.directDiffuse += diffuseColor.rgb * vec3(.44,.155,.07) * max(0.,wrap) * skinWeight;
    `);
  };
  return material;
}
