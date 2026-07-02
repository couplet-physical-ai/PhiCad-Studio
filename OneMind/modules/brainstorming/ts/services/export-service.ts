import { BrainstormRepository } from "../db/repositories/brainstorm-repository";
import type { BrainstormNode } from "../../shared/types";

interface TreeNode {
  node: BrainstormNode;
  children: TreeNode[];
}

export class ExportService {
  constructor(private repo: BrainstormRepository) {}

  async generateMarkdown(boardId: string): Promise<string> {
    const nodes = await this.repo.findNodesByBoard(boardId);
    if (nodes.length === 0) {
      return "";
    }

    const tree = this.buildTree(nodes);
    const markdown = this.traverseTree(tree);

    await this.repo.createArtifact({
      board_id: boardId,
      type: "markdown_export",
      content: markdown,
    });

    return markdown;
  }

  private buildTree(nodes: BrainstormNode[]): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // Initialize map
    for (const node of nodes) {
      nodeMap.set(node.id, { node, children: [] });
    }

    // Build hierarchy
    for (const node of nodes) {
      const treeNode = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }

    // Sort children by position (y then x)
    const sortFn = (a: TreeNode, b: TreeNode) => {
      // If y difference is significant (> 10), sort by y
      if (Math.abs(a.node.position.y - b.node.position.y) > 10) {
        return a.node.position.y - b.node.position.y;
      }
      // Otherwise sort by x
      return a.node.position.x - b.node.position.x;
    };

    roots.sort(sortFn);
    for (const node of nodeMap.values()) {
      node.children.sort(sortFn);
    }

    return roots;
  }

  private traverseTree(
    roots: TreeNode[],
    depth: number = 1,
    parentNode?: BrainstormNode
  ): string {
    let markdown = "";

    for (const root of roots) {
      markdown += this.nodeToMarkdown(root, depth, parentNode);
      markdown += this.traverseTree(root.children, depth + 1, root.node);
    }

    return markdown;
  }

  private nodeToMarkdown(
    treeNode: TreeNode,
    depth: number,
    parentNode?: BrainstormNode
  ): string {
    const { node } = treeNode;
    const indent = "#".repeat(depth);
    let content = `${indent} ${node.title}\n\n`;

    // Description
    const contentSource = node.contentRich ?? node.summaryRich;
    if (contentSource) {
      let descText = "";
      if (typeof contentSource === "string") {
        descText = contentSource;
      } else if (typeof contentSource === "object") {
        descText = JSON.stringify(contentSource, null, 2);
      } else {
        descText = String(contentSource);
      }
      content += `${descText}\n\n`;
    }

    // Stale check
    if (
      parentNode &&
      node.reviewedParentVersion !== undefined &&
      node.reviewedParentVersion < parentNode.version
    ) {
      content += `> [!WARNING] Draft: Parent has changed since last review.\n\n`;
    }

    return content;
  }
}
