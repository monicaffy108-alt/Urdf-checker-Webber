import type { SourceFile } from '../core/types'

interface LinkSpec {
  name: string
  mesh: string
}
interface JointSpec {
  name: string
  type: string
  parent: string | null
  child: string | null
  xyz: string
  axis: string | null
  limit: string | null
}

const meshPath = (name: string) => `package://demo_hand/meshes/${name}.stl`
const lim = (lo: number, up: number) => `<limit lower="${lo}" upper="${up}" effort="2" velocity="3"/>`

/** 按命名标准生成一只完整合规的手：腕 → 活动手掌 → 拇指 + 四指 */
function buildHand(): { links: LinkSpec[]; joints: JointSpec[] } {
  const links: LinkSpec[] = [{ name: 'wrist_base_link', mesh: meshPath('wrist_base_link') }]
  const joints: JointSpec[] = []
  const X = '1 0 0'
  const Y = '0 1 0'
  const Z = '0 0 1'

  const chain = (parent: string, specs: [string, string, string, number, number, string?][]) => {
    let p = parent
    for (const [jn, ln, axis, lo, up, xyz] of specs) {
      links.push({ name: ln, mesh: meshPath(ln) })
      joints.push({ name: jn, type: 'revolute', parent: p, child: ln, xyz: xyz ?? '0 0 0.02', axis, limit: lim(lo, up) })
      p = ln
    }
  }

  chain('wrist_base_link', [
    ['wrist_roll', 'wrist_carpal_link1', X, -1.57, 1.57],
    ['wrist_yaw', 'wrist_carpal_link2', Z, -0.52, 0.52],
    ['wrist_pitch', 'wrist_carpal_link0', Y, -0.87, 0.87],
    ['hand_joint', 'hand_link', Y, -0.17, 0.17],
  ])
  chain('hand_link', [
    ['thumb_cmc_roll', 'thumb_metacarpals_base1', X, -0.5, 0.5, '-0.03 0 0.01'],
    ['thumb_cmc_yaw', 'thumb_metacarpals_base2', Z, -0.5, 0.5],
    ['thumb_cmc_pitch', 'thumb_metacarpals', Y, 0, 1],
    ['thumb_mcp', 'thumb_proximal', Y, 0, 1.2],
    ['thumb_ip', 'thumb_distal', Y, 0, 1.4],
  ])
  const fingers: [string, number][] = [
    ['index', 0.03],
    ['middle', 0.01],
    ['ring', -0.01],
    ['pinky', -0.03],
  ]
  for (const [f, x] of fingers) {
    chain('hand_link', [
      [`${f}_mcp_roll`, `${f}_metacarpals`, X, -0.35, 0.35, `${x} 0 0.05`],
      [`${f}_mcp_pitch`, `${f}_proximal`, Y, 0, 1.57],
      [`${f}_pip`, `${f}_middle`, Y, 0, 1.57],
      [`${f}_dip`, `${f}_distal`, Y, 0, 1.2],
    ])
  }
  return { links, joints }
}

function render(robot: string, links: LinkSpec[], joints: JointSpec[]): string {
  const L = links.map(
    (l) => `  <link name="${l.name}">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="${l.mesh}"/>
      </geometry>
    </visual>
    <collision>
      <geometry>
        <mesh filename="${l.mesh}"/>
      </geometry>
    </collision>
  </link>`,
  )
  const J = joints.map((j) =>
    [
      `  <joint name="${j.name}" type="${j.type}">`,
      `    <origin xyz="${j.xyz}" rpy="0 0 0"/>`,
      j.parent !== null && `    <parent link="${j.parent}"/>`,
      j.child !== null && `    <child link="${j.child}"/>`,
      j.axis !== null && `    <axis xyz="${j.axis}"/>`,
      j.limit !== null && `    ${j.limit}`,
      '  </joint>',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  return `<?xml version="1.0"?>\n<robot name="${robot}">\n${L.join('\n')}\n${J.join('\n')}\n</robot>\n`
}

/** 在 clean 的基础上故意埋错，每项检查都有几处 */
function buildBuggy(): string {
  const { links, joints } = buildHand()
  const j = (n: string) => joints.find((x) => x.name === n)!
  const l = (n: string) => links.find((x) => x.name === n)!

  // 1 格式
  j('middle_pip').type = 'revolut'
  // 2 parent / child
  j('ring_pip').parent = 'ring_proxmal'
  j('ring_dip').child = null
  // 3 命名
  j('pinky_mcp_roll').name = 'pinky_mcp_roll_joint'
  j('index_dip').name = 'Index_DIP'
  j('thumb_ip').child = 'thumb_distal_link'
  l('thumb_distal').name = 'thumb_distal_link'
  // 4 limit
  j('index_pip').limit = lim(1.57, 0)
  j('middle_dip').limit = lim(0, 0)
  j('ring_mcp_pitch').limit = '<limit effort="2" velocity="3"/>'
  j('pinky_pip').limit = lim(0, 90)
  j('thumb_mcp').limit = lim(-3.14159, 3.14159)
  j('wrist_yaw').limit = null
  // 5 axis
  j('index_mcp_roll').axis = '0 0 0'
  j('middle_mcp_roll').axis = null
  j('ring_mcp_roll').axis = '0 1.5 0'
  // 6 mesh
  l('index_distal').mesh = meshPath('index_distl')
  l('middle_distal').mesh = meshPath('Middle_Distal')
  l('ring_distal').mesh = meshPath('empty_example')
  l('pinky_distal').mesh = 'C:\\Users\\me\\hand\\meshes\\pinky_distal.stl'
  // 1 重名：再放一个 index_proximal
  links.push({ name: 'index_proximal', mesh: meshPath('index_proximal') })

  return render('demo_hand_buggy', links, joints)
}

const BROKEN = `<?xml version="1.0"?>
<robot name="demo_hand_broken">
  <link name="hand_base_link">
    <visual>
      <geometry>
        <mesh filename="package://demo_hand/meshes/hand_base_link.stl"/>
      </geometry>
    </visual>
  </link>
  <joint name="hand_joint" type="revolute">
    <parent link="hand_base_link"/>
    <child link="hand_link"/>
  </joint>
  <link name="hand_link">
</robot>
`

/** 示例文件夹：一份合规的、一份每项检查都有错的、一份 XML 都解析不了的，外加 mesh 文件 */
export function buildDemoFiles(): SourceFile[] {
  const hand = buildHand()
  const urdf = (name: string, text: string): SourceFile => ({ path: `demo_hand/urdf/${name}.urdf`, size: text.length, text })
  const mesh = (name: string, size = 2048): SourceFile => ({ path: `demo_hand/meshes/${name}.stl`, size })
  return [
    urdf('hand_1_buggy', buildBuggy()),
    urdf('hand_2_clean', render('demo_hand_clean', hand.links, hand.joints)),
    urdf('hand_3_broken_xml', BROKEN),
    ...hand.links.map((x) => mesh(x.name)),
    mesh('empty_example', 0),
  ]
}
