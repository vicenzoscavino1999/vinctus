import Foundation

// Sample data for screenshot builds (see AppRepos). Compiled only with `SCREENSHOTS`, so App Store
// builds never contain it. Each feature's sample repo lives in its own folder (`Sample…Repo.swift`);
// this file holds the people and groups they share.

#if SCREENSHOTS
enum DemoSample {
  static let users: [DiscoverUser] = [
    ("u1", "Lucía Fernández"), ("u2", "Mateo Rojas"), ("u3", "Valentina Cruz"),
    ("u4", "Diego Salazar"), ("u5", "Camila Torres"), ("u6", "Andrés Vega"),
    ("u7", "Sofía Méndez"),
  ].map { DiscoverUser(uid: $0.0, displayName: $0.1, photoURL: nil, accountVisibility: .public) }

  static let groups: [GroupSummary] = [
    ("g1", "Física para curiosos", "Charlas sobre el universo, sin fórmulas imposibles.", "science", 1284),
    ("g2", "Jazz y café", "Discos, conciertos y recomendaciones para la semana.", "music", 642),
    ("g3", "Makers Lima", "Proyectos de hardware, impresión 3D y electrónica.", "technology", 915),
    ("g4", "Club de lectura", "Un libro al mes y conversación todos los domingos.", "literature", 377),
    ("g5", "Filosofía de bolsillo", "Grandes preguntas en conversaciones cortas.", "philosophy", 508),
  ].map {
    GroupSummary(
      id: $0.0, name: $0.1, description: $0.2, categoryID: $0.3,
      ownerID: $0.0 == "g1" ? AppRepos.demoUserID : "u1",
      visibility: $0.0 == "g3" ? .private : .public,
      iconURL: nil, memberCount: $0.4, updatedAt: Date()
    )
  }
}
#endif
