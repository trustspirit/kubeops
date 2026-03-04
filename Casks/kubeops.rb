cask "kubeops" do
  version :latest
  arch arm: "arm64", intel: "x64"

  url "https://github.com/trustspirit/kubeops/releases/latest/download/KubeOps-#{version}-#{arch}.dmg"
  name "KubeOps"
  desc "Modern desktop client for Kubernetes cluster management"
  homepage "https://github.com/trustspirit/kubeops"

  app "KubeOps.app"

  zap trash: [
    "~/Library/Application Support/KubeOps",
    "~/Library/Preferences/com.kubeops.app.plist",
    "~/Library/Saved Application State/com.kubeops.app.savedState",
  ]
end
