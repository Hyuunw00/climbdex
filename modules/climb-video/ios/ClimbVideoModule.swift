import ExpoModulesCore
import AVFoundation

public class ClimbVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClimbVideo")

    AsyncFunction("trim") { (uri: String, start: Double, end: Double) async throws -> String in
      guard let url = URL(string: uri) else {
        throw Exception(name: "InvalidUri", description: uri)
      }
      let asset = AVURLAsset(url: url)
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
        throw Exception(name: "ExportSessionUnavailable", description: uri)
      }
      let output = FileManager.default.temporaryDirectory
        .appendingPathComponent("climbdex-\(UUID().uuidString).mov")
      session.outputURL = output
      session.outputFileType = .mov
      session.timeRange = CMTimeRange(
        start: CMTime(seconds: start, preferredTimescale: 600),
        end: CMTime(seconds: end, preferredTimescale: 600)
      )
      await session.export()
      if let error = session.error {
        throw Exception(name: "ExportFailed", description: error.localizedDescription)
      }
      return output.absoluteString
    }
  }
}
