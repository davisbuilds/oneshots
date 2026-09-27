"""Render presets. Final: Cycles CPU, adaptive sampling + OpenImageDenoise."""
import bpy


def apply(sc, kind="studio", quality="final"):
    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = 1600, 900
    r.resolution_percentage = 100
    r.fps = 24
    r.use_persistent_data = True
    r.use_motion_blur = kind != "studio"
    r.motion_blur_shutter = 0.5 if kind == "studio" else 0.45
    r.film_transparent = False
    r.image_settings.file_format = "PNG"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 15
    r.use_overwrite = False
    r.use_placeholder = True
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = 12 if kind == "studio" else 10
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.05
    cy.adaptive_min_samples = 4
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_quality = "BALANCED"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.max_bounces = 4
    cy.diffuse_bounces = 1
    cy.glossy_bounces = 1 if kind == "studio" else 2
    cy.transmission_bounces = 2
    cy.transparent_max_bounces = 16 if kind == "studio" else 8
    cy.volume_bounces = 1
    cy.sample_clamp_indirect = 8.0
    cy.blur_glossy = 1.0
    cy.use_light_tree = True
    cy.volume_step_rate = 2.0
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    vs = sc.view_settings
    vs.view_transform = "AgX"
    vs.look = "AgX - Medium High Contrast"
    vs.exposure = 0.0
    vs.gamma = 1.0
    sc.display_settings.display_device = "sRGB"
    if quality == "preview":
        r.resolution_percentage = 50
        cy.samples = 16


def compositor_haze(sc, haze=(0.60, 0.66, 0.76), strength=0.42, start=180.0, depth=5000.0, glare=True):
    """Aerial perspective from the mist pass + a restrained fog-glow on the
    brightest (plume) highlights. Blender 5 compositor node group."""
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    ms = sc.world.mist_settings
    ms.start, ms.depth, ms.falloff = start, depth, "QUADRATIC"
    ng = bpy.data.node_groups.new(f"Comp_{sc.name}", "CompositorNodeTree")
    sc.compositing_node_group = ng
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    N, L = ng.nodes, ng.links
    rl = N.new("CompositorNodeRLayers")
    rl.scene = sc
    out = N.new("NodeGroupOutput")
    mx = N.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    fac = N.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    fac.inputs[1].default_value = strength
    L.new(rl.outputs["Mist"], fac.inputs[0])
    L.new(fac.outputs[0], mx.inputs["Factor"])
    L.new(rl.outputs["Image"], [s for s in mx.inputs if s.name == "A" and s.type == "RGBA"][0])
    [s for s in mx.inputs if s.name == "B" and s.type == "RGBA"][0].default_value = (*haze, 1.0)
    last = [s for s in mx.outputs if s.type == "RGBA"][0]
    if glare:
        g = N.new("CompositorNodeGlare")
        try:
            g.inputs["Type"].default_value = "Fog Glow"
        except Exception:
            try:
                g.glare_type = "FOG_GLOW"
            except Exception:
                pass
        for k, v in (("Threshold", 6.0), ("Strength", 0.35), ("Size", 0.6)):
            if k in g.inputs:
                try:
                    g.inputs[k].default_value = v
                except Exception:
                    pass
        L.new(last, g.inputs["Image"])
        last = g.outputs["Image"]
    L.new(last, out.inputs[0])
    sc.render.use_compositing = True
    return ng
