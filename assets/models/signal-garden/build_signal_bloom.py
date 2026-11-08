import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OUTPUT = None
BLEND_PATH = None
FBX_PATH = None
PREVIEW_PATH = None
STATS_PATH = None


def configure_output_paths():
    global OUTPUT, BLEND_PATH, FBX_PATH, PREVIEW_PATH, STATS_PATH

    parser = argparse.ArgumentParser(description="Build SignalBloom into a new, isolated output directory.")
    parser.add_argument("--output-dir", type=Path, required=True, help="New or empty directory for generated outputs")
    parser.add_argument("--reference-dir", type=Path, help="Existing SignalBloom asset directory to hash and compare")
    parser.add_argument("--compare-output-dir", type=Path, help="A prior isolated build directory for reproducibility comparison")
    parser.add_argument("--write-build-record", type=Path, help="Optional explicit report destination; existing files require --overwrite-record")
    parser.add_argument("--overwrite-record", action="store_true", help="Allow replacing the explicitly selected build record")
    blender_arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    arguments = parser.parse_args(blender_arguments)

    if not bpy.app.background:
        raise RuntimeError("SignalBloom builds require Blender background mode; refusing to modify an interactive scene.")

    output = arguments.output_dir.expanduser().resolve()
    if output.exists():
        if not output.is_dir() or any(output.iterdir()):
            raise FileExistsError(f"Output directory must be new or empty; refusing to overwrite: {output}")
    else:
        output.mkdir(parents=True, exist_ok=False)

    if arguments.write_build_record:
        record_path = arguments.write_build_record.expanduser().resolve()
        if not record_path.parent.is_dir():
            raise FileNotFoundError(f"Build record parent directory does not exist: {record_path.parent}")
        if record_path.exists() and not arguments.overwrite_record:
            raise FileExistsError(f"Build record already exists; pass --overwrite-record only after preserving it: {record_path}")

    default_scene = {"Camera": "CAMERA", "Cube": "MESH", "Light": "LIGHT"}
    actual_scene = {obj.name: obj.type for obj in bpy.context.scene.objects}
    if actual_scene != default_scene:
        raise RuntimeError("Run Blender with --factory-startup so the build cannot clear a user scene.")

    OUTPUT = output
    BLEND_PATH = OUTPUT / "SignalBloom.blend"
    FBX_PATH = OUTPUT / "SignalBloom.fbx"
    PREVIEW_PATH = OUTPUT / "SignalBloom-preview.png"
    STATS_PATH = OUTPUT / "SignalBloom-build.json"
    return arguments


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_model_hash(objects):
    model = []
    for obj in sorted(objects, key=lambda item: item.name):
        materials = []
        for material in obj.data.materials:
            shader = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
            if shader:
                base_color = [round(float(value), 8) for value in shader.inputs["Base Color"].default_value]
                metallic = round(float(shader.inputs["Metallic"].default_value), 8)
                roughness = round(float(shader.inputs["Roughness"].default_value), 8)
                emission = [round(float(value), 8) for value in shader.inputs["Emission Color"].default_value]
                emission_strength = round(float(shader.inputs["Emission Strength"].default_value), 8)
            else:
                base_color = [round(float(value), 8) for value in material.diffuse_color]
                metallic = roughness = emission_strength = 0.0
                emission = [0.0, 0.0, 0.0, 1.0]
            materials.append({
                "name": material.name,
                "baseColor": base_color,
                "metallic": metallic,
                "roughness": roughness,
                "emission": emission,
                "emissionStrength": emission_strength,
            })
        model.append({
            "name": obj.name,
            "transform": {
                "location": [round(float(value), 8) for value in obj.location],
                "rotation": [round(float(value), 8) for value in obj.rotation_euler],
                "scale": [round(float(value), 8) for value in obj.scale],
            },
            "vertices": [[round(float(value), 8) for value in vertex.co] for vertex in obj.data.vertices],
            "faces": [list(polygon.vertices) for polygon in obj.data.polygons],
            "materialIndices": [polygon.material_index for polygon in obj.data.polygons],
            "materials": materials,
        })
    canonical = json.dumps(model, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def reference_model_hash(blend_path):
    object_names = ("SignalBloomPetals", "SignalBloomCore", "SignalBloomSeed")
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        missing = [name for name in object_names if name not in data_from.objects]
        if missing:
            raise RuntimeError(f"Reference .blend is missing required objects: {', '.join(missing)}")
        data_to.objects = list(object_names)

    objects = list(data_to.objects)
    if any(obj is None or obj.type != "MESH" for obj in objects):
        raise RuntimeError("Reference .blend contains a non-mesh SignalBloom object.")
    digest = canonical_model_hash(objects)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    return digest


def load_reference_assets(reference_dir, artifact_names):
    reference_paths = [reference_dir / name for name in artifact_names]
    for reference_path in reference_paths:
        if not reference_path.is_file() or reference_path.stat().st_size == 0:
            raise FileNotFoundError(f"Reference asset is missing or empty: {reference_path}")
    reference_asset_hashes = {
        path.name: {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
        for path in reference_paths
    }
    return {
        "assetHashes": reference_asset_hashes,
        "canonicalModelSha256": reference_model_hash(reference_dir / "SignalBloom.blend"),
    }


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name, color, metallic=0.0, roughness=0.4, emission=None, emission_strength=0.0):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = emission_strength
    return result


def make_petal_mesh(main_mat, vein_mat):
    vertices = []
    faces = []
    material_indices = []
    angles = [math.radians(index * (360.0 / 7.0) + 5.0) for index in range(7)]
    lengths = [0.16, 0.47, 0.88, 1.28, 1.62, 1.78]
    half_widths = [0.12, 0.27, 0.39, 0.34, 0.20, 0.025]
    center_heights = [0.14, 0.16, 0.26, 0.42, 0.60, 0.69]
    across = [-1.0, -0.5, 0.0, 0.5, 1.0]
    top_index = len(vertices)

    for petal_index, angle in enumerate(angles):
        radial = Vector((math.cos(angle), math.sin(angle), 0.0))
        tangent = Vector((-math.sin(angle), math.cos(angle), 0.0))
        petal_start = len(vertices)
        for layer in (0, 1):
            for ring_index, radius in enumerate(lengths):
                for across_value in across:
                    width = half_widths[ring_index]
                    cupping = (1.0 - abs(across_value)) * 0.075
                    z = center_heights[ring_index] + cupping - layer * 0.085
                    point = radial * radius + tangent * (across_value * width)
                    vertices.append((point.x, point.y, z))

        ring_count = len(lengths)
        across_count = len(across)
        layer_size = ring_count * across_count
        top_offset = petal_start
        bottom_offset = petal_start + layer_size
        for ring_index in range(ring_count - 1):
            for across_index in range(across_count - 1):
                a = top_offset + ring_index * across_count + across_index
                b = a + 1
                c = a + across_count + 1
                d = a + across_count
                faces.append((a, d, c, b))
                material_indices.append(1 if across_index == 1 or across_index == 2 else 0)
                a2 = bottom_offset + ring_index * across_count + across_index
                b2 = a2 + 1
                c2 = a2 + across_count + 1
                d2 = a2 + across_count
                faces.append((a2, b2, c2, d2))
                material_indices.append(0)

        for ring_index in range(ring_count - 1):
            for across_index in (0, across_count - 1):
                top_a = top_offset + ring_index * across_count + across_index
                top_b = top_offset + (ring_index + 1) * across_count + across_index
                bottom_b = bottom_offset + (ring_index + 1) * across_count + across_index
                bottom_a = bottom_offset + ring_index * across_count + across_index
                faces.append((top_a, top_b, bottom_b, bottom_a))
                material_indices.append(0)

        for across_index in range(across_count - 1):
            faces.append((top_offset + across_index, bottom_offset + across_index,
                          bottom_offset + across_index + 1, top_offset + across_index + 1))
            material_indices.append(0)
            tip_top = top_offset + (ring_count - 1) * across_count + across_index
            tip_bottom = bottom_offset + (ring_count - 1) * across_count + across_index
            faces.append((tip_top, tip_top + 1, tip_bottom + 1, tip_bottom))
            material_indices.append(0)

        # Small faceted sepals add a distinct underside silhouette without adding a texture.
        if petal_index % 2 == 0:
            base = Vector((0.0, 0.0, 0.08))
            tip = radial * 0.82 + Vector((0.0, 0.0, -0.18))
            side = tangent * 0.18
            center = len(vertices)
            vertices.extend([tuple(base - side), tuple(base + side), tuple(tip), tuple(base + Vector((0, 0, -0.12)))])
            faces.append((center, center + 1, center + 2))
            material_indices.append(0)
            faces.append((center + 1, center + 3, center + 2))
            material_indices.append(0)

    mesh = bpy.data.meshes.new("SignalBloomPetalsMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(main_mat)
    mesh.materials.append(vein_mat)
    mesh.update()
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
        polygon.use_smooth = False
    obj = bpy.data.objects.new("SignalBloomPetals", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def make_core(core_mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.43, location=(0.0, 0.0, 0.61))
    core = bpy.context.object
    core.name = "SignalBloomCore"
    core.data.name = "SignalBloomCoreMesh"
    core.data.materials.append(core_mat)
    for face in core.data.polygons:
        face.use_smooth = False
    return core


def make_seed_capsule(seed_mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.18, location=(0.0, 0.0, 0.20))
    seed = bpy.context.object
    seed.name = "SignalBloomSeed"
    seed.scale = (1.15, 1.15, 1.45)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    seed.data.name = "SignalBloomSeedMesh"
    seed.data.materials.append(seed_mat)
    for face in seed.data.polygons:
        face.use_smooth = False
    return seed


def create_preview_scene(petal_object, core_object, seed_object, background_mat):
    scene = bpy.context.scene
    engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.view_settings.view_transform = "AgX"
    scene.world.color = (0.012, 0.024, 0.03)

    ground_mesh = bpy.data.meshes.new("PreviewBackdropMesh")
    ground_mesh.from_pydata([(-100, -100, -1.25), (100, -100, -1.25), (100, 100, -1.25), (-100, 100, -1.25)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("PreviewBackdrop", ground_mesh)
    bpy.context.collection.objects.link(ground)
    ground.data.materials.append(background_mat)

    target = Vector((0.0, 0.0, 0.36))
    bpy.ops.object.camera_add(location=(4.7, -6.4, 4.2))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.9
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    lights = [
        ((-3.8, -4.6, 5.6), 950, (0.68, 0.95, 0.88), 4.5),
        ((3.6, 1.2, 4.0), 780, (0.43, 0.78, 1.0), 3.4),
        ((0.0, 4.0, 3.2), 640, (0.52, 1.0, 0.83), 2.8),
    ]
    for index, (location, energy, color, size) in enumerate(lights):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"PreviewKey{index + 1}"
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (petal_object, core_object, seed_object):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = petal_object
    bpy.ops.render.render(write_still=True)


def export_fbx(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=str(FBX_PATH),
        use_selection=True,
        object_types={"MESH"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_UNITS",
        axis_forward="-Z",
        axis_up="Y",
        use_mesh_modifiers=True,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode="AUTO",
    )


def main():
    arguments = configure_output_paths()
    reference_source = load_reference_assets(arguments.reference_dir.expanduser().resolve(), ("SignalBloom.blend", "SignalBloom.fbx", "SignalBloom-preview.png")) if arguments.reference_dir else None
    clear_scene()
    sea_glass = material("LagoonGlass", (0.045, 0.34, 0.29), metallic=0.2, roughness=0.33)
    mint_vein = material("MintVein", (0.20, 0.72, 0.54), metallic=0.08, roughness=0.44)
    core_mat = material("SignalCore", (0.22, 0.85, 0.68), metallic=0.12, roughness=0.2, emission=(0.12, 0.75, 0.54), emission_strength=1.1)
    seed_mat = material("DeepSeed", (0.025, 0.11, 0.105), metallic=0.28, roughness=0.38)
    background_mat = material("PreviewBackground", (0.008, 0.022, 0.028), roughness=0.9)

    petals = make_petal_mesh(sea_glass, mint_vein)
    core = make_core(core_mat)
    seed = make_seed_capsule(seed_mat)
    export_objects = [petals, core, seed]
    export_fbx(export_objects)
    create_preview_scene(petals, core, seed, background_mat)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    evaluated_meshes = [obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh() for obj in export_objects]
    triangle_count = sum(sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons) for mesh in evaluated_meshes)
    dimensions = {obj.name: [round(float(value), 4) for value in obj.dimensions] for obj in export_objects}
    built_model_hash = canonical_model_hash(export_objects)
    for obj, mesh in zip(export_objects, evaluated_meshes):
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    required_outputs = [BLEND_PATH, FBX_PATH, PREVIEW_PATH]
    for output in required_outputs:
        if not output.is_file() or output.stat().st_size == 0:
            raise RuntimeError(f"Expected non-empty build output is missing: {output}")
    reference = None
    if reference_source:
        reference = {
            **reference_source,
            "canonicalModelMatches": reference_source["canonicalModelSha256"] == built_model_hash,
        }

    previous_build = None
    if arguments.compare_output_dir:
        previous_dir = arguments.compare_output_dir.expanduser().resolve()
        previous_record_path = previous_dir / STATS_PATH.name
        if not previous_record_path.is_file():
            raise FileNotFoundError(f"Prior build record is missing: {previous_record_path}")
        previous_record = json.loads(previous_record_path.read_text(encoding="utf-8"))
        previous_hashes = {
            path.name: sha256_file(previous_dir / path.name)
            for path in required_outputs
            if (previous_dir / path.name).is_file()
        }
        previous_build = {
            "canonicalModelSha256": previous_record.get("canonicalModelSha256"),
            "canonicalModelMatches": previous_record.get("canonicalModelSha256") == built_model_hash,
            "artifactSha256": previous_hashes,
            "byteIdenticalArtifacts": {
                path.name: previous_hashes.get(path.name) == sha256_file(path)
                for path in required_outputs
            },
        }

    stats = {
        "schemaVersion": 2,
        "asset": "SignalBloom",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode("ascii") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "pythonVersion": sys.version.split()[0],
        "sourceScriptSha256": sha256_file(Path(__file__).resolve()),
        "canonicalModelSha256": built_model_hash,
        "export": "FBX 7.4, FBX Unit Scale, Y-up, -Z forward, 1 Blender unit per Roblox stud, no animation or external texture files",
        "meshObjects": len(export_objects),
        "triangles": triangle_count,
        "objectDimensions": dimensions,
        "preview": PREVIEW_PATH.name,
        "fbx": FBX_PATH.name,
        "source": BLEND_PATH.name,
        "artifactBytes": {path.name: path.stat().st_size for path in required_outputs},
        "sha256": {path.name: sha256_file(path) for path in required_outputs},
        "referenceAssets": reference,
        "previousBuildComparison": previous_build,
    }
    record_path = arguments.write_build_record.expanduser().resolve() if arguments.write_build_record else STATS_PATH
    record_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
