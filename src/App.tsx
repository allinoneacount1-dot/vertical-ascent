// G0 smoke scene: the App.tsx block of pmndrs-viverse references/tutorials/remove-viverse-integrations.md, unchanged.
// Replaced in G1 by the hybrid controller (D-001); <SimpleCharacter> is allowed only here.
import { Sky } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { BvhPhysicsWorld, SimpleCharacter, BvhPhysicsBody, PrototypeBox } from '@react-three/viverse'

export default function App() {
  return (
    <Canvas shadows style={{ position: "absolute", inset: "0", touchAction: "none" }}>
      <BvhPhysicsWorld>
        <Sky />
        <directionalLight intensity={1.2} position={[-10, 10, -10]} castShadow />
        <ambientLight intensity={1} />
        <SimpleCharacter />
        <BvhPhysicsBody>
          <PrototypeBox scale={[10, 1, 15]} position={[0, -0.5, 0]} />
        </BvhPhysicsBody>
      </BvhPhysicsWorld>
    </Canvas>
  )
}
