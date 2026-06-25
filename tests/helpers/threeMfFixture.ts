import JSZip from "jszip";

export async function makeThreeMfProject() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types></Types>");
  zip.file("_rels/.rels", "<Relationships></Relationships>");
  zip.file(
    "3D/3dmodel.model",
    `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="Calibration Cube" type="model"><mesh /></object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
  </build>
</model>`
  );
  zip.file(
    "Metadata/project_settings.config",
    JSON.stringify({
      sparse_infill_density: "15%",
      sparse_infill_pattern: "grid",
      wall_loops: "2",
      top_shell_layers: "3",
      bottom_shell_layers: "3",
      enable_support: "0",
      support_type: "normal(auto)",
      support_density: "15%"
    })
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
