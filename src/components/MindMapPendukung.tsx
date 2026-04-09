import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

// --- Types ---

interface RegulationNodeData {
  label: string;
  title: string;
  jenis: string;
  status: string;
  slug: string;
  nodeType: 'regulation';
}

interface CategoryNodeData {
  label: string;
  count: number;
  categoryId: string;
  nodeType: 'category';
}

interface RootNodeData {
  label: string;
  nodeType: 'root';
}

type MindMapNodeData = RegulationNodeData | CategoryNodeData | RootNodeData;

// --- Status colors ---

const statusBorder: Record<string, string> = {
  berlaku: '#16a34a',
  dicabut: '#dc2626',
  diubah: '#2563eb',
};

const statusBg: Record<string, string> = {
  berlaku: '#f0fdf4',
  dicabut: '#fef2f2',
  diubah: '#eff6ff',
};

const statusBgDark: Record<string, string> = {
  berlaku: '#052e16',
  dicabut: '#450a0a',
  diubah: '#172554',
};

// --- Node sizes ---

const NODE_SIZES = {
  root: { width: 300, height: 70 },
  category: { width: 240, height: 60 },
  regulation: { width: 260, height: 80 },
};

// --- Dagre layout ---

function getLayoutedElements(
  nodes: Node<MindMapNodeData>[],
  edges: Edge[],
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 200, marginx: 60, marginy: 60 });

  const nodeSet = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    const size =
      node.data.nodeType === 'root'
        ? NODE_SIZES.root
        : node.data.nodeType === 'category'
          ? NODE_SIZES.category
          : NODE_SIZES.regulation;
    g.setNode(node.id, { width: size.width, height: size.height });
  });

  const visibleEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
  visibleEdges.forEach((edge) => g.setEdge(edge.source, edge.target));
  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const size =
      node.data.nodeType === 'root'
        ? NODE_SIZES.root
        : node.data.nodeType === 'category'
          ? NODE_SIZES.category
          : NODE_SIZES.regulation;
    return {
      ...node,
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    };
  });

  return { nodes: layoutedNodes, edges: visibleEdges };
}

// --- Custom Nodes ---

function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  return (
    <div style={{ background: '#052240', color: '#ffca19', padding: '16px 24px', fontFamily: "'Space Grotesk', system-ui", fontWeight: 700, fontSize: '16px', borderRadius: '12px', textAlign: 'center', minWidth: NODE_SIZES.root.width }}>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      {data.label}
    </div>
  );
}

function CategoryNode({ data }: NodeProps<Node<CategoryNodeData>>) {
  return (
    <div style={{ background: '#02275d', color: '#fff', padding: '12px 20px', fontFamily: "'Space Grotesk', system-ui", fontWeight: 600, fontSize: '13px', borderRadius: '10px', textAlign: 'center', minWidth: NODE_SIZES.category.width, cursor: 'pointer' }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div>{data.label}</div>
      <div style={{ fontSize: '11px', color: '#c9a84c', marginTop: '4px' }}>{data.count} peraturan</div>
    </div>
  );
}

function RegulationNode({ data }: NodeProps<Node<RegulationNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const borderColor = statusBorder[data.status] || '#6b7280';
  const bgColor = isDark ? (statusBgDark[data.status] || '#1e293b') : (statusBg[data.status] || '#f8fafc');
  const textColor = isDark ? '#e7e5e4' : '#1e3a5f';
  return (
    <div style={{ background: bgColor, border: `2px solid ${borderColor}`, padding: '10px 14px', borderRadius: '8px', minWidth: NODE_SIZES.regulation.width, cursor: 'pointer' }}
      onClick={() => window.open(`/peraturan-pendukung/${data.jenis.toLowerCase()}/${data.slug}`, '_self')}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: borderColor, fontWeight: 600 }}>{data.label}</div>
      <div style={{ fontFamily: "'DM Sans', system-ui", fontSize: '11px', color: textColor, marginTop: '4px', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{data.title}</div>
    </div>
  );
}

const nodeTypes = { root: RootNode, category: CategoryNode, regulation: RegulationNode };

// --- Props ---

interface RegInput {
  nomor: string;
  title: string;
  jenis: string;
  status: string;
  slug: string;
  deskripsi: string;
}

interface MindMapPendukungProps {
  regulations: RegInput[];
}

// --- Main Component ---

function MindMapInner({ regulations }: MindMapPendukungProps) {
  const { fitView } = useReactFlow();

  // Group regulations by jenis
  const groups = useMemo(() => {
    const map: Record<string, RegInput[]> = {};
    regulations.forEach((r) => {
      const key = r.jenis;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [regulations]);

  // Expanded categories
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Build nodes & edges
  const { allNodes, allEdges } = useMemo(() => {
    const nodes: Node<MindMapNodeData>[] = [];
    const edges: Edge[] = [];

    // Root node
    nodes.push({
      id: 'root',
      type: 'root',
      data: { label: 'Peraturan Pendukung PBB', nodeType: 'root' },
      position: { x: 0, y: 0 },
    });

    groups.forEach(([jenis, regs]) => {
      const catId = `cat-${jenis}`;
      nodes.push({
        id: catId,
        type: 'category',
        data: { label: jenis, count: regs.length, categoryId: jenis, nodeType: 'category' },
        position: { x: 0, y: 0 },
      });
      edges.push({ id: `root-${catId}`, source: 'root', target: catId, style: { stroke: '#c9a84c', strokeWidth: 2 } });

      regs.forEach((reg) => {
        const nid = `reg-${reg.slug}`;
        nodes.push({
          id: nid,
          type: 'regulation',
          data: { label: reg.nomor, title: reg.deskripsi || reg.title, jenis: reg.jenis, status: reg.status, slug: reg.slug, nodeType: 'regulation' },
          position: { x: 0, y: 0 },
        });
        edges.push({ id: `${catId}-${nid}`, source: catId, target: nid, style: { stroke: '#334155', strokeWidth: 1 } });
      });
    });

    return { allNodes: nodes, allEdges: edges };
  }, [groups]);

  // Filter visible nodes
  const { visibleNodes, visibleEdges } = useMemo(() => {
    const visible = allNodes.filter((node) => {
      if (node.data.nodeType === 'root' || node.data.nodeType === 'category') return true;
      const parentEdge = allEdges.find((e) => e.target === node.id);
      if (parentEdge) {
        const catNode = allNodes.find((n) => n.id === parentEdge.source);
        if (catNode && catNode.data.nodeType === 'category') {
          return expanded.has((catNode.data as CategoryNodeData).categoryId);
        }
      }
      return false;
    });
    return getLayoutedElements(visible, allEdges);
  }, [allNodes, allEdges, expanded]);

  const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges);

  // Sync when expanded changes
  useMemo(() => {
    setNodes(visibleNodes);
    setEdges(visibleEdges);
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
  }, [visibleNodes, visibleEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data.nodeType === 'category') {
      const catData = node.data as CategoryNodeData;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(catData.categoryId)) {
          next.delete(catData.categoryId);
        } else {
          next.add(catData.categoryId);
        }
        return next;
      });
    }
  }, []);

  const expandedList = groups
    .filter(([jenis]) => expanded.has(jenis))
    .map(([jenis]) => jenis);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#334155" gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as MindMapNodeData;
          if (d.nodeType === 'root') return '#c9a84c';
          if (d.nodeType === 'category') return '#02275d';
          return statusBorder[(d as RegulationNodeData).status] || '#6b7280';
        }}
        maskColor="rgba(0,0,0,0.3)"
        style={{ borderRadius: '8px' }}
      />
      <Panel position="top-left">
        <div style={{ background: 'rgba(10,22,40,0.9)', padding: '12px 16px', borderRadius: '8px', color: '#e7e5e4', fontSize: '12px', maxWidth: '220px' }}>
          <p style={{ fontWeight: 600, marginBottom: '6px' }}>337 Peraturan PBB</p>
          <p style={{ color: '#a8a29e', fontSize: '11px' }}>Klik kategori untuk expand/collapse. Klik peraturan untuk detail.</p>
          {expandedList.length > 0 && (
            <div style={{ marginTop: '8px', borderTop: '1px solid #334155', paddingTop: '6px' }}>
              <p style={{ color: '#c9a84c', fontSize: '11px' }}>Expanded: {expandedList.join(', ')}</p>
            </div>
          )}
        </div>
      </Panel>
    </ReactFlow>
  );
}

export default function MindMapPendukung(props: MindMapPendukungProps) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  );
}
