import AVFoundation
import Combine
import Foundation

@MainActor
final class ChatVoiceRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
  @Published private(set) var isRecording = false
  @Published private(set) var isRequestingPermission = false
  @Published private(set) var seconds = 0
  @Published var errorMessage: String?
  @Published private(set) var finishedRecording: ChatPendingAttachment?
  private var recorder: AVAudioRecorder?
  private var ticker: Task<Void, Never>?
  private var permissionID = UUID()
  private var recordingURL: URL?

  func start() async {
    guard !isRecording, !isRequestingPermission else { return }
    isRequestingPermission = true
    errorMessage = nil
    let token = UUID()
    permissionID = token
    let granted = await AVAudioApplication.requestRecordPermission()
    guard permissionID == token else { return }
    isRequestingPermission = false
    guard granted else { errorMessage = ChatMediaError.microphoneDenied.localizedDescription; return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let url = ChatPendingAttachment.temporaryURL(extension: "m4a")
      recordingURL = url
      let recorder = try AVAudioRecorder(url: url, settings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 64_000,
      ])
      recorder.delegate = self
      guard recorder.record(forDuration: 300) else { throw ChatMediaError.recordingFailed }
      self.recorder = recorder
      seconds = 0
      isRecording = true
      ticker = Task { [weak self] in
        while !Task.isCancelled {
          do { try await Task.sleep(for: .seconds(1)) } catch { return }
          guard let self, self.isRecording else { return }
          self.seconds = Int(self.recorder?.currentTime ?? 0)
        }
      }
    } catch {
      cleanup()
      errorMessage = ChatMediaError.recordingFailed.localizedDescription
    }
  }

  func finish() {
    guard isRecording else { return }
    let url = recordingURL
    recorder?.delegate = nil
    recorder?.stop()
    cleanup(keepFile: true)
    guard let url else { return }
    do {
      finishedRecording = try ChatPickedFile.ownedFile(url, name: "Nota de voz.m4a", type: "audio/mp4", kind: .audio)
    } catch { errorMessage = error.localizedDescription }
  }

  func takeRecording() -> ChatPendingAttachment? {
    defer { finishedRecording = nil }
    return finishedRecording
  }

  func cancel() {
    permissionID = UUID()
    isRequestingPermission = false
    recorder?.delegate = nil
    recorder?.stop()
    cleanup()
    finishedRecording = nil
  }

  private func cleanup(keepFile: Bool = false) {
    ticker?.cancel()
    ticker = nil
    recorder = nil
    isRecording = false
    if let url = recordingURL, !keepFile { try? FileManager.default.removeItem(at: url) }
    recordingURL = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    Task { @MainActor [weak self] in
      guard let self, self.recorder === recorder else { return }
      if flag { self.finish() }
      else { self.cancel(); self.errorMessage = ChatMediaError.recordingFailed.localizedDescription }
    }
  }

  nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    Task { @MainActor [weak self] in
      guard let self, self.recorder === recorder else { return }
      self.cancel()
      self.errorMessage = ChatMediaError.recordingFailed.localizedDescription
    }
  }
}
