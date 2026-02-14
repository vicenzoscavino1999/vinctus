import SwiftUI

struct VTopSafeAreaBackground: View {
  var body: some View {
    GeometryReader { proxy in
      VinctusTokens.Color.background
        .frame(height: proxy.safeAreaInsets.top)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
    .allowsHitTesting(false)
  }
}
